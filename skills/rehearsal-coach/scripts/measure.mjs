// Turns a word-level transcript into the numbers of references/rehearsal-rubric.md §3:
// runtime, words per minute and its spread, fillers and hedges with timestamps, pauses.
// Pure functions; analyse.mjs feeds them Whisper's JSON.

export const VOCAL_FILLERS = ['um', 'umm', 'uh', 'uhh', 'er', 'erm', 'ah', 'hmm', 'mm'];
// Longest first, so "you know" is counted once and not as "you" + "know".
export const HEDGES = ['to be honest', 'you know', 'sort of', 'kind of', 'i think', 'i guess', 'i mean', 'like', 'maybe', 'just', 'basically', 'actually', 'right?'];
export const PAUSE_SECONDS = 1.5;

// Whisper's JSON: segments[].words[] of { word, start, end }. A token without a leading space
// continues the word before it ("run" + "-throughs"), so it is merged, not counted twice.
export function readTranscript(json) {
  const raw = Array.isArray(json) ? json : (json.segments ?? []).flatMap((s) => s.words ?? []);
  const words = [];
  for (const w of raw) {
    const token = String(w.word ?? w.text ?? '');
    if (!token.trim()) continue;
    const last = words.at(-1);
    if (last && !/^\s/.test(token)) {
      last.text += token;
      last.end = w.end;
    } else words.push({ text: token.trim(), start: w.start, end: w.end });
  }
  if (!words.length) throw new Error('The transcript has no words with timestamps. Run Whisper with --word_timestamps True.');
  return words;
}

export const mmss = (seconds) => {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

const norm = (text) => text.toLowerCase().replace(/[^\p{L}\p{N}'?]/gu, '');
const round1 = (n) => Math.round(n * 10) / 10;

function findFillers(words) {
  const tokens = words.map((w) => norm(w.text));
  const found = [];
  for (let i = 0; i < words.length; i++) {
    const bare = tokens[i].replace(/\?$/, '');
    if (VOCAL_FILLERS.includes(bare)) {
      found.push({ word: bare, kind: 'vocal', start: words[i].start, t: mmss(words[i].start) });
      continue;
    }
    for (const hedge of HEDGES) {
      const parts = hedge.split(' ');
      const slice = tokens.slice(i, i + parts.length);
      const matches = parts.every((p, k) => (p.endsWith('?') ? slice[k] === p : slice[k]?.replace(/\?$/, '') === p));
      if (matches) {
        found.push({ word: hedge, kind: 'hedge', start: words[i].start, t: mmss(words[i].start) });
        i += parts.length - 1;
        break;
      }
    }
  }
  return found;
}

// Words per minute for each minute of the talk; a last part shorter than 15 seconds is too
// short to say anything and is left out.
function wpmByMinute(words, start, end) {
  const out = [];
  for (let from = start; from < end; from += 60) {
    const to = Math.min(from + 60, end);
    if (to - from < 15) break;
    const n = words.filter((w) => w.start >= from && w.start < to).length;
    out.push({ t: mmss(from - start), wpm: Math.round(n / ((to - from) / 60)) });
  }
  return out;
}

export function measure(words, { slotMinutes } = {}) {
  const start = words[0].start;
  const end = words.at(-1).end;
  const runtimeSeconds = round1(end - start);
  const minutes = (end - start) / 60;

  const fillers = findFillers(words);
  const counts = {};
  for (const f of fillers) counts[f.word] = (counts[f.word] ?? 0) + 1;

  const pauses = [];
  for (let i = 1; i < words.length; i++) {
    const gap = words[i].start - words[i - 1].end;
    if (gap >= PAUSE_SECONDS)
      pauses.push({
        t: mmss(words[i - 1].end - start),
        seconds: round1(gap),
        after: words.slice(Math.max(0, i - 6), i).map((w) => w.text).join(' '),
        filled: [words[i - 1], words[i]].some((w) => VOCAL_FILLERS.includes(norm(w.text).replace(/\?$/, ''))),
      });
  }

  const m = {
    runtimeSeconds,
    runtime: mmss(runtimeSeconds),
    words: words.length,
    wpm: Math.round(words.length / minutes),
    wpmByMinute: wpmByMinute(words, start, end),
    fillers: {
      total: fillers.length,
      perMinute: round1(fillers.length / minutes),
      vocal: fillers.filter((f) => f.kind === 'vocal').length,
      hedges: fillers.filter((f) => f.kind === 'hedge').length,
      counts,
      mostFrequent: Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
      at: fillers.map(({ word, t }) => ({ word, t })),
    },
    pauses: {
      count: pauses.length,
      longestSeconds: pauses.length ? Math.max(...pauses.map((p) => p.seconds)) : 0,
      list: pauses,
    },
  };
  if (slotMinutes) {
    m.slotMinutes = slotMinutes;
    m.overSlotSeconds = Math.round(runtimeSeconds - slotMinutes * 60);
  }
  return m;
}

// The metrics a goal can name and the script can check by itself.
export const GOAL_METRICS = {
  wpm: { label: 'words per minute', read: (m) => m.wpm },
  fillersPerMinute: { label: 'fillers per minute', read: (m) => m.fillers.perMinute },
  pauses: { label: `pauses of ${PAUSE_SECONDS} s or more`, read: (m) => m.pauses.count },
  longestPauseSeconds: { label: 'longest pause in seconds', read: (m) => m.pauses.longestSeconds },
  runtimeMinutes: { label: 'runtime in minutes', read: (m) => round1(m.runtimeSeconds / 60) },
};

// { met: true | false, actual } when the goal names a metric, null when it needs judging.
export function checkGoal(goal, measurements) {
  const metric = goal && GOAL_METRICS[goal.metric];
  if (!metric || !measurements) return null;
  const actual = metric.read(measurements);
  const met = (goal.max === undefined || actual <= goal.max) && (goal.min === undefined || actual >= goal.min);
  return { met, actual, label: metric.label };
}
