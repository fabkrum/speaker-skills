#!/usr/bin/env node
// Turns one take into the report of references/rehearsal-rubric.md §5 and appends it to the
// talk's take log. The numbers come from measurements.json (analyse.mjs); the judgement comes
// from review.json, written by the coach after watching the recording and its frames.
//
//   node report.mjs <talk>/rehearsals/take-NN
//
// Exit 0 writes report.md and appends the take to <talk>/rehearsals/takes.json;
// exit 1 lists what review.json is missing and writes nothing.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkGoal, GOAL_METRICS, PAUSE_SECONDS } from './measure.mjs';
import { readTakeLog, goalProblems, goalToCheck, describeGoalSource, today, TAKE_LOG } from './talk-log.mjs';

export class ReportError extends Error {}

// The nine dimensions of the rubric, in its order.
export const DIMENSIONS = [
  ['timing', 'Timing and pace'],
  ['fillers', 'Fillers and hedges'],
  ['pauses', 'Pauses'],
  ['answerFirst', 'Answer first'],
  ['voice', 'Voice'],
  ['body', 'Body and presence'],
  ['story', 'Story and message'],
  ['connection', 'Audience connection'],
  ['openClose', 'Opening and close'],
];
const STATUS = { red: '🔴 red', yellow: '🟡 yellow', green: '🟢 green' };
const LANDS = ['yes', 'partly', 'no'];
const MMSS = /^\d{1,3}:\d{2}$/;
const TIMESTAMP = /\b\d{1,3}:\d{2}\b/;

const text = (v) => typeof v === 'string' && v.trim().length > 0;

export function reviewProblems(review, { goal, measurements } = {}) {
  const p = [];
  if (!text(review.verdict)) p.push('verdict: one line, would it land with the audience in the brief, and the biggest problem.');

  const a = review.audience ?? {};
  if (!LANDS.includes(String(a.lands).toLowerCase())) p.push('audience.lands: yes, partly or no.');
  if (!Number.isInteger(a.nextStepLikelihood) || a.nextStepLikelihood < 0 || a.nextStepLikelihood > 10)
    p.push('audience.nextStepLikelihood: how likely they take the next step, a whole number 0 to 10.');
  if (!text(a.voice)) p.push('audience.voice: the verdict in the audience\'s voice ("As a ... I ...").');

  for (const [key, label] of DIMENSIONS) {
    const s = review.scores?.[key];
    if (!s) {
      p.push(`scores.${key}: missing (${label}).`);
      continue;
    }
    if (!STATUS[s.status]) p.push(`scores.${key}.status: red, yellow or green.`);
    if (!text(s.reason)) p.push(`scores.${key}.reason: one line why.`);
    if (s.status === 'red' || s.status === 'yellow') {
      if (!text(s.evidence) || !TIMESTAMP.test(s.evidence)) p.push(`scores.${key}.evidence: the moment that shows it, with its mm:ss.`);
      if (!text(s.fix)) p.push(`scores.${key}.fix: what to do about it.`);
    }
  }

  if (!Array.isArray(review.receipts) || review.receipts.length === 0) p.push('receipts: the worst moments, each { "t": "mm:ss", "note": "..." }.');
  else
    review.receipts.forEach((r, i) => {
      if (!MMSS.test(r?.t ?? '') || !text(r?.note)) p.push(`receipts[${i}]: needs "t" as mm:ss and a "note".`);
    });

  if (!Array.isArray(review.fixes) || review.fixes.length !== 3 || !review.fixes.every(text))
    p.push('fixes: exactly three, highest leverage first, each saying what to do.');

  p.push(...goalProblems(review.goal, 'goal'));
  if (review.goal && !text(review.goal.why)) p.push('goal.why: one line on why this change matters most now.');

  // A goal the script cannot check from the numbers is judged by the coach, and must be.
  if (goal && !checkGoal(goal.goal, measurements) && typeof review.goalCheck?.met !== 'boolean')
    p.push(`goalCheck: the goal to check first ("${goal.goal.text}") needs a judgement: { "met": true or false, "note": "what the recording shows" }.`);
  return p;
}

const signed = (n) => (n > 0 ? `+${n}` : `${n}`);

function numbersTable(m, prev, review) {
  const rows = [];
  const row = (label, value, before) => rows.push(`| ${label} | ${value} | ${before ?? '–'} |`);
  const delta = (now, then) => (then === undefined ? undefined : `${then} (${signed(Math.round((now - then) * 10) / 10)})`);
  const slot = m.slotMinutes ? ` against a ${m.slotMinutes}-minute slot, ${m.overSlotSeconds >= 0 ? `${m.overSlotSeconds} s over` : `${-m.overSlotSeconds} s under`}` : '';
  row('Runtime', `${m.runtime}${slot}`, prev?.runtime);
  row('Words per minute', `${m.wpm} (by minute: ${m.wpmByMinute.map((x) => `${x.t} ${x.wpm}`).join(', ')})`, delta(m.wpm, prev?.wpm));
  row('Fillers per minute', `${m.fillers.perMinute} (${m.fillers.total} in total: ${m.fillers.vocal} um/uh, ${m.fillers.hedges} hedges)`, delta(m.fillers.perMinute, prev?.fillersPerMinute));
  row('Most frequent filler', m.fillers.mostFrequent ? `"${m.fillers.mostFrequent}" ×${m.fillers.counts[m.fillers.mostFrequent]}` : 'none', prev?.mostFrequentFiller ?? undefined);
  row(`Pauses of ${PAUSE_SECONDS} s or more`, String(m.pauses.count), delta(m.pauses.count, prev?.pauses));
  row('Longest pause', `${m.pauses.longestSeconds} s`, prev?.longestPauseSeconds === undefined ? undefined : `${prev.longestPauseSeconds} s`);
  if (typeof review.eyesOffPercent === 'number') row('Eyes off the audience (estimate)', `${review.eyesOffPercent} %`, prev?.eyesOffPercent === undefined ? undefined : `${prev.eyesOffPercent} %`);
  return ['| | This take | Last take |', '|---|---|---|', ...rows].join('\n');
}

function goalTarget(goal) {
  const metric = GOAL_METRICS[goal.metric];
  if (!metric) return '';
  const bounds = [goal.min !== undefined && `at least ${goal.min}`, goal.max !== undefined && `at most ${goal.max}`].filter(Boolean).join(' and ');
  return ` (target: ${metric.label} ${bounds})`;
}

export function renderReport({ talk, take, date, goal, measurements: m, review, previous }) {
  const out = [`# Rehearsal report: ${talk}, take ${take} (${date})`, ''];

  // The goal from last time comes first: that is how each rehearsal and each talk builds on the last.
  out.push(`## ${describeGoalSource(goal)}`, '');
  if (!goal) out.push('None yet: no earlier take of this talk and no goal in a talk log. This take sets the first one.');
  else {
    const auto = checkGoal(goal.goal, m);
    const met = auto ? auto.met : review.goalCheck.met;
    const how = auto ? ` ${auto.label} this take: ${auto.actual}.` : '';
    out.push(`**${goal.goal.text}**${goalTarget(goal.goal)}`, '', `${met ? '✅ Met.' : '❌ Not met.'}${how}${review.goalCheck?.note ? ` ${review.goalCheck.note}` : ''}`);
  }
  out.push('', '## Verdict', '', review.verdict, '');

  const a = review.audience;
  out.push("## From the audience's seat", '', a.voice, '', `Does it land? **${a.lands[0].toUpperCase()}${a.lands.slice(1).toLowerCase()}.** How likely they take the next step: **${a.nextStepLikelihood}/10**.`, '');

  out.push('## Scorecard', '', '| # | Dimension | Score | Why | Evidence | Fix |', '|---|---|---|---|---|---|');
  DIMENSIONS.forEach(([key, label], i) => {
    const s = review.scores[key];
    const cell = (v) => (v ? String(v).replace(/\|/g, '\\|').replace(/\n/g, ' ') : '');
    out.push(`| ${i + 1} | ${label} | ${STATUS[s.status]} | ${cell(s.reason)} | ${cell(s.evidence)} | ${cell(s.fix)} |`);
  });
  out.push('', '## Receipts', '', ...review.receipts.map((r) => `- \`${r.t}\` ${r.note}`), '');

  out.push('## The numbers', '');
  if (m) {
    out.push(numbersTable(m, previous?.numbers, review), '');
    if (m.fillers.at.length) out.push(`Every filler: ${m.fillers.at.map((f) => `\`${f.t}\` ${f.word}`).join(' · ')}`, '');
    if (m.pauses.list.length) out.push(`Every pause: ${m.pauses.list.map((x) => `\`${x.t}\` ${x.seconds} s after "${x.after}"${x.filled ? ' (filled)' : ''}`).join(' · ')}`, '');
    out.push('Automatic transcripts sometimes drop fillers: listen to the passages before quoting a count back.', '');
  } else out.push('Counted by hand: see `checklist.md` in this folder.', '');

  out.push('## Top three fixes', '', ...review.fixes.map((f, i) => `${i + 1}. ${f}`), '');
  out.push('## Goal for the next rehearsal', '', `**${review.goal.text}**${goalTarget(review.goal)}`, '', review.goal.why, '');
  if (m) out.push('---', '', `Recording: \`${m.recording}\` · transcript: \`transcript.json\` · frames: ${m.frames.length ? `\`frames/\` (${m.frames.length})` : 'none'}`, '');
  return out.join('\n');
}

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

export function report(takeDir) {
  takeDir = resolve(takeDir);
  const talkDir = dirname(dirname(takeDir));
  const reviewFile = join(takeDir, 'review.json');
  if (!existsSync(reviewFile)) throw new ReportError(`No review.json in ${takeDir}. Write the judgement first (see the skill's SKILL.md).`);
  const review = readJson(reviewFile);
  const measurementsFile = join(takeDir, 'measurements.json');
  const m = existsSync(measurementsFile) ? readJson(measurementsFile) : null;
  if (!m && !existsSync(join(takeDir, 'checklist.md'))) throw new ReportError(`No measurements.json and no checklist.md in ${takeDir}. Run analyse.mjs on the recording first.`);

  const take = m?.take ?? Number(basename(takeDir).match(/\d+/)?.[0]);
  const log = readTakeLog(talkDir);
  if (log.takes.some((t) => t.take === take)) throw new ReportError(`Take ${take} is already in the take log; takes are appended, never overwritten.`);
  // analyse.mjs recorded which goal to check when it measured; a manual take looks it up now.
  const goal = m ? m.goalToCheck : goalToCheck(talkDir);

  const problems = reviewProblems(review, { goal, measurements: m });
  if (problems.length) throw new ReportError(`review.json is not finished:\n- ${problems.join('\n- ')}`);

  const previous = log.takes.at(-1);
  const date = m?.date ?? today();
  const md = renderReport({ talk: log.talk, take, date, goal, measurements: m, review, previous });
  writeFileSync(join(takeDir, 'report.md'), md);

  const auto = goal ? checkGoal(goal.goal, m) : null;
  log.takes.push({
    take,
    date,
    recording: m?.recording ?? null,
    goalChecked: goal ? { ...goal, met: auto ? auto.met : review.goalCheck.met } : null,
    numbers: m
      ? {
          runtime: m.runtime,
          runtimeSeconds: m.runtimeSeconds,
          words: m.words,
          wpm: m.wpm,
          fillers: m.fillers.total,
          fillersPerMinute: m.fillers.perMinute,
          mostFrequentFiller: m.fillers.mostFrequent,
          pauses: m.pauses.count,
          longestPauseSeconds: m.pauses.longestSeconds,
          eyesOffPercent: review.eyesOffPercent,
        }
      : null,
    audience: review.audience,
    scores: Object.fromEntries(DIMENSIONS.map(([key]) => [key, review.scores[key].status])),
    receipts: review.receipts,
    fixes: review.fixes,
    goal: review.goal,
  });
  writeFileSync(join(talkDir, 'rehearsals', TAKE_LOG), `${JSON.stringify(log, null, 2)}\n`);
  return { report: join(takeDir, 'report.md'), take, goal: review.goal };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: node report.mjs <talk>/rehearsals/take-NN');
    process.exit(1);
  }
  try {
    const r = report(dir);
    console.log(`Report written: ${r.report}\nTake ${r.take} added to the take log. Next rehearsal checks first: ${r.goal.text}`);
  } catch (e) {
    if (!(e instanceof ReportError)) throw e;
    console.error(e.message);
    process.exit(1);
  }
}
