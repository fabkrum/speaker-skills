// talk-builder: the brief gate, the storyboard critique gate, the style file that is written once,
// and the deck it builds, graded by the html-slides deck check in a real browser.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, cpSync, rmSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { readBrief, checkBrief, MAX_THROUGHLINE_WORDS } from '../skills/talk-builder/scripts/check-brief.mjs';
import { writeStyle, StyleError } from '../skills/talk-builder/scripts/style-file.mjs';
import { buildTalk, TalkError } from '../skills/talk-builder/scripts/build-talk.mjs';
import { findStyle, readStyle } from '../skills/html-slides/scripts/build-deck.mjs';
import { checkDeck } from '../skills/html-slides/scripts/check-deck.mjs';
import { checkRepo } from '../scripts/check-repo.mjs';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const skill = join(root, 'skills', 'talk-builder');
const example = join(skill, 'examples', 'talks');

const dirs = [];
after(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'talk-builder-test-'));
  dirs.push(d);
  return d;
};

const BRIEF = `# Talk brief

\`\`\`
BRIEF
Goal:         teach
Outcome:      they record their next rehearsal on a phone
Next step:    record one run-through this week and watch it once
Throughline:  Your phone is the rehearsal coach you already own.
Audience:     junior developers, about 40, never filmed themselves, curious
Format:       talk · no Q&A · 5 minutes → about 6 slides
Room:         10 m to the back row / dimmable / 16:9
Style:        style file
Guide:        https://example.com/rehearse
\`\`\`
`;

const CRITIQUE = `# Storyboard critique

Throughline as read: your phone is the rehearsal coach you already own.

## Curse of knowledge

- Slide 4 "WPM": jargon. Say "words per minute" the first time.

## Structure

Problem, solution, proof, next step. The hook is a question, not an agenda.

## Top fixes

1. Spell out WPM.
`;

const brief = (patch = {}) => {
  let text = BRIEF;
  for (const [key, value] of Object.entries(patch)) {
    const line = new RegExp(`^${key}:.*$`, 'm');
    text = value === null ? text.replace(line, '') : text.replace(line, `${key}: ${value}`);
  }
  return text;
};

// A talk folder in a talks folder: brief and critique in the talk, the deck in slides/.
function makeTalk({ briefText = BRIEF, critique = CRITIQUE, style } = {}) {
  const talks = tmp();
  const talk = join(talks, 'rehearse-with-your-phone');
  mkdirSync(join(talk, 'slides'), { recursive: true });
  if (briefText !== null) writeFileSync(join(talk, 'talk-brief.md'), briefText);
  if (critique !== null) writeFileSync(join(talk, 'storyboard-critique.md'), critique);
  if (style) writeStyle(talks, style);
  const deck = {
    title: 'Rehearse with your phone',
    slides: [
      { type: 'image', alt: 'A phone on a tripod facing an empty stage', placeholder: 'phone on a tripod', sentence: 'Your phone is the only rehearsal coach you need.', notes: 'Hook: who has watched themselves speak?' },
      { type: 'qr', sentence: 'Your next step is in the guide.', url: 'https://example.com/rehearse' },
    ],
  };
  writeFileSync(join(talk, 'slides', 'deck.json'), JSON.stringify(deck));
  return { talks, talk, deckJson: join(talk, 'slides', 'deck.json') };
}

// --- the brief ---

test('a complete brief passes and keeps its throughline', () => {
  const b = readBrief(BRIEF);
  assert.equal(b.throughline, 'Your phone is the rehearsal coach you already own.');
  assert.equal(b.goal, 'teach');
  assert.equal(b['next step'], 'record one run-through this week and watch it once');
  assert.deepEqual(checkBrief(b), []);
});

test('the brief is refused without a throughline', () => {
  for (const value of [null, '', 'TBD', '?']) {
    const problems = checkBrief(readBrief(brief({ Throughline: value })));
    assert.ok(problems.some((p) => /throughline/i.test(p)), `throughline "${value}" passed`);
  }
});

test('the brief is refused when the throughline runs over 15 words', () => {
  assert.equal(MAX_THROUGHLINE_WORDS, 15);
  const fifteen = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen.';
  assert.deepEqual(checkBrief(readBrief(brief({ Throughline: fifteen }))), []);
  const problems = checkBrief(readBrief(brief({ Throughline: `${fifteen} sixteen` })));
  assert.ok(problems.some((p) => /16 words/.test(p)), problems.join('; '));
});

test('the brief needs one goal, one outcome, one next step, the audience and talk or workshop', () => {
  for (const key of ['Goal', 'Outcome', 'Next step', 'Audience', 'Format'])
    assert.ok(checkBrief(readBrief(brief({ [key]: null }))).some((p) => p.toLowerCase().includes(key.toLowerCase())), `${key} missing passed`);
  assert.ok(checkBrief(readBrief(brief({ Goal: 'teach and inspire' }))).some((p) => /goal/i.test(p)), 'two goals passed');
  assert.ok(checkBrief(readBrief(brief({ Format: 'a session' }))).some((p) => /talk or workshop/i.test(p)), 'no format passed');
  assert.deepEqual(checkBrief(readBrief(brief({ Format: 'workshop · 90 minutes, own laptops' }))), []);
  assert.deepEqual(checkBrief(readBrief(brief({ Goal: 'drive action' }))), []);
});

test('the brief checker refuses on the command line', () => {
  const { talk } = makeTalk({ briefText: brief({ Throughline: null }) });
  const run = spawnSync(process.execPath, [join(skill, 'scripts', 'check-brief.mjs'), join(talk, 'talk-brief.md')], { encoding: 'utf8' });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /throughline/i);
  const ok = makeTalk();
  const pass = spawnSync(process.execPath, [join(skill, 'scripts', 'check-brief.mjs'), join(ok.talk, 'talk-brief.md')], { encoding: 'utf8' });
  assert.equal(pass.status, 0, pass.stderr);
  assert.match(pass.stdout, /Your phone is the rehearsal coach you already own\./);
});

// --- the build gate ---

test('the deck is not built without a brief, a throughline or the storyboard critique', () => {
  for (const [what, opts, message] of [
    ['no brief', { briefText: null }, /talk-brief\.md/],
    ['no throughline', { briefText: brief({ Throughline: null }) }, /throughline/i],
    ['no critique', { critique: null }, /storyboard-critique\.md/],
    ['a critique without the curse-of-knowledge scan', { critique: CRITIQUE.replace('## Curse of knowledge', '## Notes') }, /curse of knowledge/i],
    ['a critique without the structure finding', { critique: CRITIQUE.replace('## Structure', '## Notes') }, /structure/i],
  ]) {
    const { deckJson, talk } = makeTalk(opts);
    assert.throws(() => buildTalk(deckJson), (e) => e instanceof TalkError && message.test(e.message), what);
    assert.ok(!existsSync(join(talk, 'slides', 'index.html')), `${what}: a deck was built`);
  }
});

test('with a brief and a critique the deck is built in the speaker style', () => {
  const { deckJson, talk, talks } = makeTalk({ style: { scheme: 'dark', background: '#1b1f24', text: '#ffffff', accent: '#e69f00', motif: 'a paper boat' } });
  const result = buildTalk(deckJson);
  assert.equal(result.throughline, 'Your phone is the rehearsal coach you already own.');
  assert.equal(result.styleFile, join(talks, 'speaker-style.md'));
  const html = readFileSync(join(talk, 'slides', 'index.html'), 'utf8');
  assert.match(html, /--deck-bg: #1b1f24;/);
});

// --- the style file ---

test('the style file is written once and found by the next talk without asking again', () => {
  const talks = tmp();
  const file = writeStyle(talks, {
    look: 'warm, calm, one object per picture',
    scheme: 'dark',
    background: '#14171c',
    text: '#ffffff',
    accent: '#e69f00',
    'image-kind': 'flat illustrations',
    motif: 'a paper boat',
  }, 'Never stock photos of handshakes.');
  assert.equal(file, join(talks, 'speaker-style.md'));
  const style = readStyle(readFileSync(file, 'utf8'));
  assert.equal(style.background, '#14171c');
  assert.equal(style.motif, 'a paper boat');
  assert.match(readFileSync(file, 'utf8'), /Never stock photos of handshakes\./);

  // The next talk, in a sibling folder, finds the same file.
  const next = join(talks, 'next-talk', 'slides');
  mkdirSync(next, { recursive: true });
  assert.equal(findStyle(next), file);

  // Writing again, from the talks folder or the next talk, is refused and leaves the file alone.
  const before = readFileSync(file, 'utf8');
  for (const dir of [talks, next])
    assert.throws(() => writeStyle(dir, { motif: 'a kite' }), (e) => e instanceof StyleError && e.message.includes(file));
  assert.equal(readFileSync(file, 'utf8'), before);
});

test('the style file refuses colours that fail the contrast rule', () => {
  assert.throws(() => writeStyle(tmp(), { background: '#777777', text: '#ffffff' }), (e) => e instanceof StyleError && /4\.5:1/.test(e.message));
  assert.throws(() => writeStyle(tmp(), { scheme: 'light', text: '#bbbbbb' }), (e) => e instanceof StyleError && /4\.5:1/.test(e.message));
  assert.throws(() => writeStyle(tmp(), { panel: '#eeeeee' }), (e) => e instanceof StyleError && /panel/.test(e.message));
  assert.throws(() => writeStyle(tmp(), { accent: 'orange' }), (e) => e instanceof StyleError && /hex/.test(e.message));
  assert.throws(() => writeStyle(tmp(), { scheme: 'sepia' }), (e) => e instanceof StyleError && /dark or light/.test(e.message));
  assert.throws(() => writeStyle(tmp(), { colour: '#ffffff' }), (e) => e instanceof StyleError && /colour/.test(e.message));
  assert.throws(() => writeStyle(tmp(), { motif: 'two\nlines' }), (e) => e instanceof StyleError && /one line/.test(e.message));
});

test('the style file can be written and found from the command line', () => {
  const talks = tmp();
  const script = join(skill, 'scripts', 'style-file.mjs');
  const missing = spawnSync(process.execPath, [script, 'find', talks], { encoding: 'utf8' });
  assert.equal(missing.status, 1);
  assert.match(missing.stdout, /No style file/);
  const write = spawnSync(process.execPath, [script, 'write', talks, 'scheme=light', 'motif=a lighthouse', '--notes', 'Calm.'], { encoding: 'utf8' });
  assert.equal(write.status, 0, write.stderr);
  const found = execFileSync(process.execPath, [script, 'find', join(talks)], { encoding: 'utf8' });
  assert.match(found, /speaker-style\.md/);
  assert.match(found, /motif: a lighthouse/);
  const again = spawnSync(process.execPath, [script, 'write', talks, 'motif=a kite'], { encoding: 'utf8' });
  assert.equal(again.status, 1);
  assert.match(again.stderr, /already/);
});

// --- the example and the plugin ---

test('the example talk builds and its deck passes the deck check', async () => {
  const dir = tmp();
  cpSync(example, dir, { recursive: true, filter: (src) => !/index\.html$|[/\\]deck$|deck-check\.json$/.test(src) });
  const deckJson = join(dir, 'rehearse-with-your-phone', 'slides', 'deck.json');
  const { slides, styleFile } = buildTalk(deckJson);
  assert.ok(slides >= 6);
  assert.equal(styleFile, join(dir, 'speaker-style.md'));
  const deck = JSON.parse(readFileSync(deckJson, 'utf8'));
  assert.ok(deck.slides.some((s) => s.ai === 'photo'), 'the example shows no AI label');
  assert.ok(deck.slides.filter((s) => s.type !== 'black').every((s) => s.notes || s.type === 'qr'), 'a slide has no speaker notes');
  assert.equal(deck.slides.at(-1).type, 'qr');

  const report = await checkDeck(join(dir, 'rehearse-with-your-phone', 'slides'));
  assert.deepEqual(report.problems, []);
  assert.equal(report.passed, true);
});

test('talk-builder passes the repo check', () => {
  assert.deepEqual(checkRepo(root).filter((p) => p.file.startsWith('skills/talk-builder') || p.file.startsWith('evals/talk-builder')), []);
});
