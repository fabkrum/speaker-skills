// rehearsal-coach: the numbers on the sample recording against a hand count, the manual
// checklist when the tools are missing, the report, the take log and the talk log that carries
// one goal from talk to talk.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, cpSync, rmSync, existsSync, mkdirSync, chmodSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { readTranscript, measure, checkGoal } from '../skills/rehearsal-coach/scripts/measure.mjs';
import { analyse, findTools, installSteps, slotFromBrief } from '../skills/rehearsal-coach/scripts/analyse.mjs';
import { report, reviewProblems, ReportError, DIMENSIONS } from '../skills/rehearsal-coach/scripts/report.mjs';
import { addTalk, goalToCheck, LogError } from '../skills/rehearsal-coach/scripts/talk-log.mjs';
import { checkRepo } from '../scripts/check-repo.mjs';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const skill = join(root, 'skills', 'rehearsal-coach');
const sample = join(skill, 'examples', 'sample-recording');
const example = join(skill, 'examples', 'talks');
const TALK = 'rehearse-with-your-phone';

const dirs = [];
after(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'rehearsal-coach-test-'));
  dirs.push(d);
  return d;
};
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const sampleTranscript = join(sample, 'whisper-transcript.json');

// The example talks folder in a temp dir: the talk log with last talk's goal, the brief, the recording.
function talks() {
  const dir = tmp();
  cpSync(example, dir, { recursive: true });
  return { talks: dir, talk: join(dir, TALK), recording: join(dir, TALK, 'rehearsal-1.mp4') };
}

// Stand-ins for ffmpeg, ffprobe and Whisper on PATH: Whisper "transcribes" by copying the sample's
// real Whisper output, ffmpeg writes empty files where frames would go.
function stubTools() {
  const bin = tmp();
  const stub = (name, body) => {
    const file = join(bin, name);
    writeFileSync(file, `#!${process.execPath}\nconst fs = require('fs'), path = require('path');\nconst args = process.argv.slice(2);\n${body}\n`);
    chmodSync(file, 0o755);
  };
  stub('ffprobe', "console.log('video\\naudio');");
  stub('ffmpeg', "const out = args.at(-1); if (out.includes('%04d')) { for (const n of [1, 2, 3]) fs.writeFileSync(out.replace('%04d', String(n).padStart(4, '0')), ''); } else fs.writeFileSync(out, '');");
  stub('whisper', `const dir = args[args.indexOf('--output_dir') + 1]; if (!args.includes('--word_timestamps')) process.exit(3); fs.copyFileSync(${JSON.stringify(sampleTranscript)}, path.join(dir, path.basename(args[0]).replace(/\\.wav$/, '.json')));`);
  return { PATH: bin };
}

const REVIEW = {
  verdict: 'It would land with a nervous junior audience, but ten fillers in a minute make the speaker sound unsure of the one claim that matters.',
  audience: { lands: 'partly', nextStepLikelihood: 6, voice: 'As a junior developer who has never filmed myself, I get the idea, but the "um"s make me wonder if you believe it.' },
  scores: {
    timing: { status: 'green', reason: '0:59 against a one-minute slot, 147 words per minute.' },
    fillers: { status: 'red', reason: '10.2 fillers per minute.', evidence: '00:41 "I think three run-throughs are, uh, basically enough"', fix: 'Replace each filler with a breath.' },
    pauses: { status: 'green', reason: 'A pause after every key line.' },
    answerFirst: { status: 'green', reason: 'Each point comes first.' },
    voice: { status: 'yellow', reason: 'Even pace throughout.', evidence: '00:30 the three things all at one speed', fix: 'Slow down for the three things.' },
    body: { status: 'yellow', reason: 'The frames are a test pattern; nothing to judge.', evidence: '00:00 no speaker in frame', fix: 'Film yourself, not the screen.' },
    story: { status: 'green', reason: 'Throughline and next step are both said.' },
    connection: { status: 'green', reason: 'Opens with a question to the room.' },
    openClose: { status: 'yellow', reason: 'The close trails into "that\'s it".', evidence: '00:57 "That\'s it. Thank you."', fix: 'End on the next step, then stop.' },
  },
  receipts: [
    { t: '00:41', note: '"I think ... uh, basically": three hedges on the claim the talk rests on.' },
    { t: '00:57', note: '"That\'s it" undercuts the next step.' },
  ],
  fixes: ['Breathe instead of "um" and "uh".', 'Say the three things slower than the rest.', 'End on the next step and stop.'],
  goal: { text: 'Fillers per minute from 10.2 to under 4', metric: 'fillersPerMinute', max: 4, why: 'The fillers are what makes the next step sound optional.' },
  eyesOffPercent: 0,
};

// --- the numbers on the sample recording ---

test('on the sample recording, words per minute, fillers and pauses are within the stated tolerance of the hand count', () => {
  const hand = readJson(join(sample, 'hand-count.json'));
  const m = measure(readTranscript(readJson(sampleTranscript)));
  const { wpmPercent, fillers, pauses } = hand.tolerance;
  assert.ok(Math.abs(m.wpm - hand.wpm) <= (hand.wpm * wpmPercent) / 100, `WPM ${m.wpm}, hand count ${hand.wpm} ±${wpmPercent} %`);
  assert.ok(Math.abs(m.words - hand.words) <= Math.ceil((hand.words * wpmPercent) / 100), `${m.words} words, hand count ${hand.words}`);
  assert.ok(Math.abs(m.fillers.total - hand.fillers.total) <= fillers, `${m.fillers.total} fillers, hand count ${hand.fillers.total} ±${fillers}`);
  assert.ok(Math.abs(m.pauses.count - hand.pauses) <= pauses, `${m.pauses.count} pauses, hand count ${hand.pauses} ±${pauses}`);
  for (const [word, n] of Object.entries(hand.fillers.counts)) assert.ok(Math.abs((m.fillers.counts[word] ?? 0) - n) <= fillers, `"${word}" ×${m.fillers.counts[word] ?? 0}, hand count ×${n}`);
});

test('the sample README states the tolerance the test holds the coach to', () => {
  const readme = readFileSync(join(sample, 'README.md'), 'utf8');
  const { tolerance } = readJson(join(sample, 'hand-count.json'));
  assert.match(readme, new RegExp(`within ${tolerance.wpmPercent} %`));
  assert.match(readme, new RegExp(`filler total\\s+within ${tolerance.fillers}`));
  assert.match(readme, new RegExp(`pause count within ${tolerance.pauses}`));
});

test('fillers are counted with their timestamps, hedges as phrases, split words as one word', () => {
  const at = (text, start) => ({ word: ` ${text}`, start, end: start + 0.3 });
  const words = readTranscript([
    at('So,', 0), at('um,', 0.5), at('you', 1), at('know,', 1.3), at('I', 2), at('like', 2.3), at('this.', 2.6),
    at('Run', 5), { word: '-throughs', start: 5.3, end: 5.6 }, at('work,', 5.7), at('right?', 6.1), at('Right', 7), at('now.', 7.3),
  ]);
  assert.equal(words.length, 12);
  assert.equal(words[7].text, 'Run-throughs');
  const m = measure(words, { slotMinutes: 1 });
  assert.deepEqual(m.fillers.counts, { um: 1, 'you know': 1, like: 1, 'right?': 1 });
  assert.deepEqual(m.fillers.at.map((f) => f.t), ['00:00', '00:01', '00:02', '00:06']);
  assert.equal(m.pauses.count, 1);
  assert.equal(m.pauses.list[0].t, '00:02');
  assert.equal(m.pauses.list[0].after, 'um, you know, I like this.');
  assert.equal(m.overSlotSeconds, -52);
});

test('a goal naming a metric is checked from the numbers', () => {
  const m = measure(readTranscript(readJson(sampleTranscript)));
  assert.deepEqual(checkGoal({ text: 'x', metric: 'pauses', min: 5 }, m), { met: true, actual: 6, label: 'pauses of 1.5 s or more' });
  assert.equal(checkGoal({ text: 'x', metric: 'fillersPerMinute', max: 4 }, m).met, false);
  assert.equal(checkGoal({ text: 'Look at the back row in 3 of 4 frames' }, m), null);
});

test('the slot is read from the talk brief', () => {
  const { talk } = talks();
  assert.equal(slotFromBrief(talk), 1);
});

// --- missing tools ---

test('without ffmpeg or Whisper the coach writes the manual checklist, says how to install them, and exits 0', () => {
  const { talk, recording } = talks();
  const run = spawnSync(process.execPath, [join(skill, 'scripts', 'analyse.mjs'), recording], { encoding: 'utf8', env: { PATH: tmp() } });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /manual checklist/i);
  assert.match(run.stdout, /ffmpeg/);
  assert.match(run.stdout, /whisper/i);
  const checklist = readFileSync(join(talk, 'rehearsals', 'take-01', 'checklist.md'), 'utf8');
  assert.match(checklist, /Talk: rehearse-with-your-phone/);
  assert.match(checklist, /Take: 1/);
  // The goal the last talk set is on it, first.
  assert.match(checklist, /Goal from last time: Pause after every key line/);
  assert.match(checklist, /Top three fixes/);
  assert.ok(!existsSync(join(talk, 'rehearsals', 'take-01', 'measurements.json')));
});

test('when a tool runs and fails, the coach still leaves the manual checklist', () => {
  const { talk, recording } = talks();
  const empty = join(tmp(), 'empty.json');
  writeFileSync(empty, JSON.stringify({ segments: [{ text: '', words: [] }] }));
  assert.throws(() => analyse(recording, { transcript: empty, env: { PATH: tmp() } }), (e) => /word_timestamps/.test(e.message) && e.checklist === join(talk, 'rehearsals', 'take-01', 'checklist.md'));
  assert.ok(existsSync(join(talk, 'rehearsals', 'take-01', 'checklist.md')));
});

test('the install steps cover macOS, Windows and Linux', () => {
  assert.match(installSteps('darwin'), /brew install ffmpeg/);
  assert.match(installSteps('win32'), /winget install --id Gyan\.FFmpeg/);
  assert.match(installSteps('linux'), /apt install ffmpeg/);
  for (const p of ['darwin', 'win32', 'linux']) assert.match(installSteps(p), /pipx install openai-whisper/);
  const md = readFileSync(join(skill, 'SKILL.md'), 'utf8');
  for (const heading of ['macOS', 'Windows', 'Linux']) assert.match(md, new RegExp(`^### ${heading}`, 'm'), `SKILL.md has no install steps for ${heading}`);
  for (const cmd of ['brew install ffmpeg', 'winget install --id Gyan.FFmpeg -e', 'sudo apt install ffmpeg pipx', 'pipx install openai-whisper']) assert.ok(md.includes(cmd), `SKILL.md lacks "${cmd}"`);
});

test('a tool that is missing is found missing', () => {
  assert.deepEqual(findTools({ PATH: tmp() }).missing, ['ffmpeg', 'ffprobe', 'whisper']);
  assert.deepEqual(findTools(stubTools()).missing, []);
});

test('the manual checklist is the one in the rehearsal rubric', () => {
  const rubric = readFileSync(join(root, 'references', 'rehearsal-rubric.md'), 'utf8');
  const block = rubric.slice(rubric.indexOf('## 7.')).match(/```\n([\s\S]*?)```/)[1];
  assert.equal(readFileSync(join(skill, 'assets', 'manual-checklist.txt'), 'utf8'), block);
});

// --- report, take log, talk log ---

test('the first rehearsal reports on the goal the last talk set, first, and logs the take', { skip: process.platform === 'win32' && 'stub tools are shell scripts' }, () => {
  const { talk, recording } = talks();
  const env = stubTools();
  const r = analyse(recording, { env });
  assert.equal(r.manual, false);
  const takeDir = join(talk, 'rehearsals', 'take-01');
  const m = readJson(join(takeDir, 'measurements.json'));
  assert.equal(m.goalToCheck.source, 'talk');
  assert.equal(m.goalToCheck.talk, 'web-pages-that-respond');
  assert.deepEqual(m.goalCheck, { met: true, actual: 6, label: 'pauses of 1.5 s or more' });
  assert.equal(m.slotMinutes, 1);
  assert.equal(m.recording, '../../rehearsal-1.mp4');
  assert.ok(m.frames.length >= 3 && m.frames.every((f) => existsSync(join(takeDir, f.file))), 'frames not sampled');
  assert.ok(existsSync(join(takeDir, 'transcript.json')));

  writeFileSync(join(takeDir, 'review.json'), JSON.stringify(REVIEW));
  report(takeDir);
  const md = readFileSync(join(takeDir, 'report.md'), 'utf8');
  const sections = [...md.matchAll(/^## (.*)$/gm)].map((x) => x[1]);
  assert.match(sections[0], /^Goal from your last talk \("web-pages-that-respond", 2026-09-18\)/);
  assert.match(md.slice(md.indexOf('## Goal from'), md.indexOf('## Verdict')), /✅ Met\. pauses of 1\.5 s or more this take: 6\./);
  for (const s of ['Verdict', "From the audience's seat", 'Scorecard', 'Receipts', 'The numbers', 'Top three fixes', 'Goal for the next rehearsal']) assert.ok(sections.includes(s), `no "${s}" section`);
  assert.match(md, /How likely they take the next step: \*\*6\/10\*\*/);
  assert.match(md, /🔴 red/);
  assert.match(md, /`00:41`/);
  assert.match(md, /\| Words per minute \| 147/);
  assert.match(md, /Fillers per minute \| 10\.2/);

  const log = readJson(join(talk, 'rehearsals', 'takes.json'));
  assert.equal(log.takes.length, 1);
  assert.equal(log.takes[0].goal.text, 'Fillers per minute from 10.2 to under 4');
  assert.equal(log.takes[0].goalChecked.met, true);
  assert.equal(log.takes[0].scores.fillers, 'red');

  // The second take checks the goal the first take set, and compares with it.
  analyse(recording, { env });
  const take2 = join(talk, 'rehearsals', 'take-02');
  assert.equal(readJson(join(take2, 'measurements.json')).goalToCheck.source, 'take');
  writeFileSync(join(take2, 'review.json'), JSON.stringify(REVIEW));
  report(take2);
  const md2 = readFileSync(join(take2, 'report.md'), 'utf8');
  assert.match(md2, /^## Goal from take 1\n\n\*\*Fillers per minute from 10\.2 to under 4\*\*/m);
  assert.match(md2, /❌ Not met\. fillers per minute this take: 10\.2\./);
  assert.match(md2, /\| Words per minute \| 147 .*\| 147 \(0\) \|/);
  assert.equal(readJson(join(talk, 'rehearsals', 'takes.json')).takes.length, 2);

  // Takes are appended, never overwritten.
  assert.throws(() => report(take2), (e) => e instanceof ReportError && /already/.test(e.message));
});

test('the report refuses an unfinished review and writes nothing', () => {
  const { talk } = talks();
  const takeDir = join(talk, 'rehearsals', 'take-01');
  mkdirSync(takeDir, { recursive: true });
  writeFileSync(join(takeDir, 'measurements.json'), JSON.stringify({ take: 1, date: '2026-10-25', goalToCheck: null, ...measure(readTranscript(readJson(sampleTranscript))), recording: 'x.mp4', frames: [] }));
  const broken = structuredClone(REVIEW);
  delete broken.scores.voice;
  broken.scores.fillers.evidence = 'lots of them';
  broken.fixes = ['one', 'two'];
  broken.goal = { text: 'Be more confident', why: 'It matters.' };
  broken.audience.nextStepLikelihood = 11;
  writeFileSync(join(takeDir, 'review.json'), JSON.stringify(broken));
  assert.throws(() => report(takeDir), (e) => {
    assert.ok(e instanceof ReportError);
    for (const p of [/scores\.voice/, /scores\.fillers\.evidence/, /fixes/, /not measurable/, /nextStepLikelihood/]) assert.match(e.message, p);
    return true;
  });
  assert.ok(!existsSync(join(takeDir, 'report.md')));
  assert.ok(!existsSync(join(talk, 'rehearsals', 'takes.json')));
  assert.equal(DIMENSIONS.length, 9);
});

test('a goal the numbers cannot check must be judged in the review', () => {
  const goal = { source: 'talk', talk: 'x', date: '2026-01-01', goal: { text: 'Eyes on the room in 3 of every 4 frames' } };
  const problems = reviewProblems(REVIEW, { goal, measurements: null });
  assert.ok(problems.some((p) => /goalCheck/.test(p)), problems.join('; '));
  assert.deepEqual(reviewProblems({ ...REVIEW, goalCheck: { met: false, note: 'Mostly on the slides.' } }, { goal, measurements: null }), []);
});

test('the talk log carries the last goal to the next talk, not to the talk that set it', () => {
  const dir = tmp();
  const next = join(dir, 'next-talk');
  mkdirSync(next);
  assert.equal(goalToCheck(next), null);
  assert.throws(() => addTalk(dir, { talk: 'first-talk', goal: { text: 'Be calmer' } }), (e) => e instanceof LogError && /measurable/.test(e.message));
  addTalk(dir, { talk: 'first-talk', date: '2026-10-01', goal: { text: 'Fillers per minute under 2', metric: 'fillersPerMinute', max: 2 }, notes: 'Rushed the demo.' });
  const g = goalToCheck(next);
  assert.equal(g.source, 'talk');
  assert.equal(g.talk, 'first-talk');
  assert.equal(g.goal.max, 2);
  // The talk that set the goal does not check it on itself.
  mkdirSync(join(dir, 'first-talk'));
  assert.equal(goalToCheck(join(dir, 'first-talk')), null);
});

test('the talk log works from the command line', () => {
  const dir = tmp();
  const script = join(skill, 'scripts', 'talk-log.mjs');
  const add = spawnSync(process.execPath, [script, 'add', dir, 'first-talk', '--goal', 'At least 4 pauses after key lines', '--metric', 'pauses', '--min', '4'], { encoding: 'utf8' });
  assert.equal(add.status, 0, add.stderr);
  mkdirSync(join(dir, 'second-talk'));
  const goal = spawnSync(process.execPath, [script, 'goal', join(dir, 'second-talk')], { encoding: 'utf8' });
  assert.equal(goal.status, 0, goal.stderr);
  assert.match(goal.stdout, /Goal from your last talk \("first-talk", \d{4}-\d{2}-\d{2}\): At least 4 pauses after key lines/);
  assert.deepEqual(readJson(join(dir, 'talk-log.json')).talks[0].goal, { text: 'At least 4 pauses after key lines', metric: 'pauses', min: 4 });
});

// --- the plugin ---

test('the eval case grades the sample recording', () => {
  const kase = readFileSync(join(root, 'evals', 'rehearsal-coach-sample', 'case.yaml'), 'utf8');
  assert.match(kase, /rehearsal-1\.mp4/);
  assert.match(kase, /report\.md/);
  assert.match(kase, /takes\.json/);
  assert.match(kase, /Goal from your last talk/);
  assert.ok(existsSync(join(root, 'evals', 'rehearsal-coach-sample', 'setup.sh')));
});

test('rehearsal-coach passes the repo check', () => {
  assert.deepEqual(checkRepo(root).filter((p) => p.file.startsWith('skills/rehearsal-coach') || p.file.startsWith('evals/rehearsal-coach')), []);
});

// The real tools on the real recording. Slow (Whisper), so only when asked for:
//   REHEARSAL_COACH_LIVE=1 node --test test/rehearsal-coach.test.mjs
test('live: ffmpeg and Whisper on the sample recording stay within the tolerance', { skip: !process.env.REHEARSAL_COACH_LIVE && 'set REHEARSAL_COACH_LIVE=1 to run Whisper' }, () => {
  assert.deepEqual(findTools().missing, [], 'install ffmpeg and Whisper first');
  const { talk, recording } = talks();
  analyse(recording);
  const m = readJson(join(talk, 'rehearsals', 'take-01', 'measurements.json'));
  const hand = readJson(join(sample, 'hand-count.json'));
  assert.ok(Math.abs(m.wpm - hand.wpm) <= (hand.wpm * hand.tolerance.wpmPercent) / 100, `WPM ${m.wpm}`);
  assert.ok(Math.abs(m.fillers.total - hand.fillers.total) <= hand.tolerance.fillers, `${m.fillers.total} fillers`);
  assert.ok(readdirSync(join(talk, 'rehearsals', 'take-01', 'frames')).length >= 12);
});
