// companion-guide: the guide people get after the talk, and the guide half of the artefact check
// that grades it in a real browser. Needs a Chromium-based browser, like the deck check.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, cpSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { buildGuide, GuideError, inline } from '../skills/companion-guide/scripts/build-guide.mjs';
import { checkGuide, MIN_BODY_PX } from '../skills/companion-guide/scripts/check-guide.mjs';
import { launch } from '../skills/html-slides/scripts/browser.mjs';
import { checkRepo } from '../scripts/check-repo.mjs';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const skill = join(root, 'skills', 'companion-guide');
const example = join(skill, 'examples', 'talk');

let browser;
const dirs = [];
before(async () => {
  browser = await launch();
});
after(async () => {
  await browser?.close();
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'companion-guide-test-'));
  dirs.push(d);
  return d;
};

const svg = (fill) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90" width="1600" height="900"><rect width="160" height="90" fill="${fill}"/></svg>`;

// A talk with a four-slide deck (an AI photo, an AI illustration, a figure, the QR slide) and its guide.
const DECK = {
  title: 'Rehearse with your phone',
  slides: [
    { type: 'image', image: 'images/wince.svg', alt: 'A speaker winces at their own recording', sentence: 'It hurts once, then it helps.', ai: 'photo', notes: 'Story: 23 fillers.' },
    { type: 'image', image: 'images/boat.svg', alt: 'A paper boat on a desk', sentence: 'Small and steady beats big and rare.', ai: 'illustration' },
    { type: 'text', sentence: 'Three run-throughs are enough.', figure: '3' },
    { type: 'qr', sentence: 'Your next step is in the guide.', url: 'https://example.com/rehearse' },
  ],
};
const section = (concept) => ({ concept, body: [`What ${concept.toLowerCase()} means, and what to do about it.`] });
const GUIDE = {
  title: 'Rehearse with your phone',
  deck: '../slides/deck.json',
  aiTool: 'an image model',
  sections: [section('Watching yourself'), section('Small steps'), section('Three run-throughs'), section('This guide')],
  nextStep: { action: 'Record one run-through this week and watch it once.', how: ['Prop the phone at eye height.', 'Give the whole talk.', 'Watch it the same day.'] },
  furtherReading: [{ title: 'Whisper', url: 'https://github.com/openai/whisper' }],
};

function makeTalk({ deck = DECK, guide = GUIDE } = {}) {
  const talk = tmp();
  mkdirSync(join(talk, 'slides', 'images'), { recursive: true });
  mkdirSync(join(talk, 'guide'));
  writeFileSync(join(talk, 'slides', 'images', 'wince.svg'), svg('#2a2f36'));
  writeFileSync(join(talk, 'slides', 'images', 'boat.svg'), svg('#3a5f7a'));
  writeFileSync(join(talk, 'slides', 'deck.json'), JSON.stringify(deck));
  writeFileSync(join(talk, 'guide', 'guide.json'), JSON.stringify(guide));
  return { talk, guideJson: join(talk, 'guide', 'guide.json'), guideDir: join(talk, 'guide'), deckJson: join(talk, 'slides', 'deck.json') };
}

const built = (opts) => {
  const t = makeTalk(opts);
  buildGuide(t.guideJson);
  return t;
};
const edit = (dir, from, to) => {
  const file = join(dir, 'index.html');
  const html = readFileSync(file, 'utf8');
  assert.ok(html.includes(from), `index.html does not contain ${from}`);
  writeFileSync(file, html.replace(from, to));
};
const checks = (report) => report.problems.map((p) => p.check);
const sectionOf = (html, n) => html.match(new RegExp(`<section class="guide-slide" id="slide-${n}"[\\s\\S]*?</section>\\n`))[0];

// --- the guide a speaker gets ---

test('the example guide builds from its deck and passes the guide check', async () => {
  const dir = tmp();
  cpSync(example, dir, { recursive: true, filter: (src) => !/index\.html$|[/\\]deck$|-check\.json$/.test(src) });
  const { sections, styleFile, aiImages } = buildGuide(join(dir, 'guide', 'guide.json'));
  const deck = JSON.parse(readFileSync(join(dir, 'slides', 'deck.json'), 'utf8'));
  assert.equal(sections, deck.slides.length);
  assert.equal(styleFile, join(dir, 'speaker-style.md'));
  assert.equal(aiImages, deck.slides.filter((s) => s.ai).length);

  const report = await checkGuide(join(dir, 'guide'), { browser });
  assert.deepEqual(report.problems, []);
  assert.equal(report.passed, true);
  assert.equal(report.sections, deck.slides.length);
});

test('one section per slide, in order, each naming its concept beside its slide', () => {
  const { guideDir } = built();
  const html = readFileSync(join(guideDir, 'index.html'), 'utf8');
  const order = [...html.matchAll(/<section class="guide-slide" id="slide-(\d+)" data-slide="\1"/g)].map((m) => Number(m[1]));
  assert.deepEqual(order, [1, 2, 3, 4]);
  const first = sectionOf(html, 1);
  assert.match(first, /<h2[^>]*>Watching yourself<\/h2>/);
  assert.match(first, /<p class="guide-slide__sentence">It hurts once, then it helps\.<\/p>/);
  assert.match(first, /alt="A speaker winces at their own recording" data-ai="photo"/);
  assert.match(first, /<p class="ai-label">AI-generated<\/p>/);
  assert.doesNotMatch(sectionOf(html, 2), /ai-label/, 'an illustration got the slide label');
  assert.match(sectionOf(html, 3), /<p class="guide-slide__big">3<\/p>/);
  assert.doesNotMatch(html, /notes|23 fillers/, 'speaker notes leaked into the guide');
});

test('the next step comes after the sections, further reading after it, the colophon last', () => {
  const { guideDir } = built();
  const html = readFileSync(join(guideDir, 'index.html'), 'utf8');
  const at = (s) => html.indexOf(s);
  assert.ok(at('id="slide-4"') < at('>Your next step</h2>'));
  assert.ok(at('>Your next step</h2>') < at('>Further reading</h2>'));
  assert.ok(at('>Further reading</h2>') < at('>Colophon</h2>'));
  assert.equal(html.match(/class="next-step__action"/g).length, 1);
  assert.match(html, /<h3>How to do it<\/h3>\s*<ol>\s*<li>Prop the phone at eye height\.<\/li>/);
});

test('the colophon lists every AI-generated image with its slide and tool', () => {
  const { guideDir } = built();
  const colophon = readFileSync(join(guideDir, 'index.html'), 'utf8').split('id="colophon"')[1];
  assert.match(colophon, /<li data-slide="1">Slide 1, A speaker winces at their own recording: a photorealistic image made with an image model\.<\/li>/);
  assert.match(colophon, /<li data-slide="2">Slide 2, A paper boat on a desk: an illustration made with an image model\.<\/li>/);
  assert.doesNotMatch(colophon, /data-slide="3"/);
});

test('the guide is one file: images inlined, nothing loaded from elsewhere, in the speaker style', () => {
  const { talk, guideJson, guideDir } = makeTalk();
  writeFileSync(join(talk, 'speaker-style.md'), '---\nscheme: light\nbackground: "#f6f4ef"\ntext: "#14171c"\naccent: "#0072b2"\n---\n');
  const { styleFile } = buildGuide(guideJson);
  assert.equal(styleFile, join(talk, 'speaker-style.md'));
  const html = readFileSync(join(guideDir, 'index.html'), 'utf8');
  assert.match(html, /--guide-bg: #f6f4ef;/);
  assert.match(html, /<img src="data:image\/svg\+xml;base64,/);
  assert.doesNotMatch(html, /<(link|script)\b/);
  assert.doesNotMatch(html, /src="(?!data:)/);
});

test('a guide without a deck carries its own slides', async () => {
  const dir = tmp();
  writeFileSync(join(dir, 'storyboard.md'), '# Storyboard\n\n1. The hook\n2. The next step\n');
  writeFileSync(join(dir, 'boat.svg'), svg('#3a5f7a'));
  const guide = {
    ...GUIDE,
    deck: undefined,
    sections: [
      { ...section('The hook'), sentence: 'Watching yourself is the fastest way to improve.', image: 'boat.svg', alt: 'A paper boat', ai: 'illustration' },
      section('This guide'),
    ],
  };
  writeFileSync(join(dir, 'guide.json'), JSON.stringify(guide));
  buildGuide(join(dir, 'guide.json'));
  const report = await checkGuide(dir, { storyboard: join(dir, 'storyboard.md'), browser });
  assert.deepEqual(report.problems, []);
  assert.equal(report.slides, 2);
});

test('inline text keeps code and links and escapes the rest', () => {
  assert.equal(inline('Run `ffmpeg -i a.mp4` <now> & see [the docs](https://ffmpeg.org/).'),
    'Run <code>ffmpeg -i a.mp4</code> &lt;now&gt; &amp; see <a href="https://ffmpeg.org/">the docs</a>.');
  assert.equal(inline('[bad](javascript:alert(1))'), '[bad](javascript:alert(1))');
});

// --- the build refuses what the method forbids ---

test('the guide is not built without one section per slide, the next step or the AI tool', () => {
  const without = (key) => Object.fromEntries(Object.entries(GUIDE).filter(([k]) => k !== key));
  for (const [what, guide, message] of [
    ['a missing section', { ...GUIDE, sections: GUIDE.sections.slice(1) }, /4 slides and the guide 3 sections/],
    ['an extra section', { ...GUIDE, sections: [...GUIDE.sections, section('Extra')] }, /one section per slide/],
    ['a section without its concept', { ...GUIDE, sections: [{ body: ['x'] }, ...GUIDE.sections.slice(1)] }, /concept/],
    ['a section without an explanation', { ...GUIDE, sections: [{ concept: 'X', body: [] }, ...GUIDE.sections.slice(1)] }, /explain/],
    ['a sentence that differs from the deck', { ...GUIDE, sections: [{ ...section('X'), sentence: 'Other.' }, ...GUIDE.sections.slice(1)] }, /come from the deck/],
    ['no next step', without('nextStep'), /nextStep/],
    ['several actions', { ...GUIDE, nextStep: { ...GUIDE.nextStep, action: ['Record.', 'Watch.'] } }, /one action/],
    ['no how-to', { ...GUIDE, nextStep: { action: 'Record one.', how: [] } }, /how/],
    ['no further reading', without('furtherReading'), /furtherReading/],
    ['further reading without an address', { ...GUIDE, furtherReading: [{ title: 'A book' }] }, /url/],
    ['an AI image without its tool', without('aiTool'), /tool/],
  ]) {
    const { guideJson } = makeTalk({ guide });
    assert.throws(() => buildGuide(guideJson), (e) => e instanceof GuideError && message.test(e.message), what);
  }
});

test('the builder refuses and explains on the command line', () => {
  const script = join(skill, 'scripts', 'build-guide.mjs');
  const bad = makeTalk({ guide: { ...GUIDE, sections: GUIDE.sections.slice(1) } });
  const fail = spawnSync(process.execPath, [script, bad.guideJson], { encoding: 'utf8' });
  assert.equal(fail.status, 1);
  assert.match(fail.stderr, /Guide not built: .*one section per slide/);
  const good = makeTalk();
  const pass = spawnSync(process.execPath, [script, good.guideJson], { encoding: 'utf8' });
  assert.equal(pass.status, 0, pass.stderr);
  assert.match(pass.stdout, /4 sections, 2 AI image\(s\) in the colophon/);
  assert.doesNotMatch(pass.stdout, /QR slide/);
  const elsewhere = makeTalk({ guide: { ...GUIDE, url: 'https://example.com/other' } });
  const warn = spawnSync(process.execPath, [script, elsewhere.guideJson], { encoding: 'utf8' });
  assert.equal(warn.status, 0, warn.stderr);
  assert.match(warn.stdout, /QR slide opens https:\/\/example\.com\/rehearse, not this guide's address/);
});

// --- the guide check catches what the method forbids ---

test('the check passes a built guide and reads the deck from guide.json', async () => {
  const { guideDir } = built();
  const report = await checkGuide(guideDir, { browser });
  assert.deepEqual(report.problems, []);
  assert.equal(report.slides, 4);
  assert.equal(report.aiImages, 2);
  assert.ok(report.lowestContrast >= 4.5);
});

test('the check fails a guide that misses a slide or changes the order', async () => {
  const missing = built();
  const html = readFileSync(join(missing.guideDir, 'index.html'), 'utf8');
  edit(missing.guideDir, sectionOf(html, 3), '');
  assert.ok(checks(await checkGuide(missing.guideDir, { browser })).includes('sections'));

  const swapped = built();
  const s2 = sectionOf(html, 2), s3 = sectionOf(html, 3);
  edit(swapped.guideDir, s2 + s3, s3 + s2);
  const report = await checkGuide(swapped.guideDir, { browser });
  assert.ok(report.problems.some((p) => p.check === 'sections' && /order/.test(p.message)), JSON.stringify(report.problems));

  // A deck that grew a slide after the guide was written.
  const grown = built();
  writeFileSync(grown.deckJson, JSON.stringify({ ...DECK, slides: [...DECK.slides, { type: 'black' }] }));
  assert.ok((await checkGuide(grown.guideDir, { browser })).problems.some((p) => /4 slide sections and the storyboard 5/.test(p.message)));
});

test('the check fails without one next step, or with further reading before it', async () => {
  const none = built();
  edit(none.guideDir, '>Your next step</h2>', '>What now</h2>');
  assert.ok(checks(await checkGuide(none.guideDir, { browser })).includes('next-step'));

  const two = built();
  edit(two.guideDir, '<h3>How to do it</h3>', '<p class="next-step__action">And share the guide.</p><h3>How to do it</h3>');
  assert.ok((await checkGuide(two.guideDir, { browser })).problems.some((p) => /2 actions/.test(p.message)));

  const early = built();
  const html = readFileSync(join(early.guideDir, 'index.html'), 'utf8');
  const reading = html.match(/<section class="further-reading"[\s\S]*?<\/section>\n/)[0];
  writeFileSync(join(early.guideDir, 'index.html'), html.replace(reading, '').replace('<section class="next-step"', reading + '<section class="next-step"'));
  assert.ok(checks(await checkGuide(early.guideDir, { browser })).includes('further-reading'));
});

test('the check fails an AI image missing from the colophon or a photo without its label', async () => {
  const unlisted = built();
  edit(unlisted.guideDir, '<li data-slide="2">', '<li>');
  const report = await checkGuide(unlisted.guideDir, { browser });
  assert.ok(report.problems.some((p) => p.check === 'colophon' && p.slide === 2), JSON.stringify(report.problems));

  const unlabelled = built();
  edit(unlabelled.guideDir, '<p class="ai-label">AI-generated</p>', '');
  assert.ok(checks(await checkGuide(unlabelled.guideDir, { browser })).includes('ai-label'));

  const noAlt = built();
  edit(noAlt.guideDir, 'alt="A paper boat on a desk"', 'alt=""');
  assert.ok(checks(await checkGuide(noAlt.guideDir, { browser })).includes('alt'));
});

test('the check fails sideways scroll, small text, low contrast and network loads on a 390 px phone', async () => {
  const wide = built();
  edit(wide.guideDir, '</main>', '<p style="width: 600px">Too wide.</p></main>');
  assert.ok(checks(await checkGuide(wide.guideDir, { browser })).includes('phone'));

  const small = built();
  edit(small.guideDir, '</style>', `main p { font-size: ${MIN_BODY_PX - 4}px; }</style>`);
  assert.ok(checks(await checkGuide(small.guideDir, { browser })).includes('text-size'));

  const faint = built();
  edit(faint.guideDir, '</style>', 'a { color: #333333; }</style>');
  assert.ok(checks(await checkGuide(faint.guideDir, { browser })).includes('contrast'));

  const online = built();
  edit(online.guideDir, '</head>', '<link rel="stylesheet" href="https://example.com/x.css"></head>');
  assert.ok(checks(await checkGuide(online.guideDir, { browser })).includes('offline'));
});

test('the check runs on the command line and writes guide-check.json', () => {
  const { guideDir, talk } = built();
  const script = join(skill, 'scripts', 'check-guide.mjs');
  const run = spawnSync(process.execPath, [script, guideDir], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /Guide check passed: 4 sections for 4 slides/);
  assert.equal(JSON.parse(readFileSync(join(guideDir, 'guide-check.json'), 'utf8')).passed, true);

  const story = join(talk, 'storyboard.md');
  writeFileSync(story, '1. One\n2. Two\n');
  const fail = spawnSync(process.execPath, [script, guideDir, '--storyboard', story], { encoding: 'utf8' });
  assert.equal(fail.status, 1);
  assert.match(fail.stdout, /4 slide sections and the storyboard 2 slides/);

  writeFileSync(join(guideDir, 'guide.json'), JSON.stringify({ ...GUIDE, deck: undefined }));
  const none = spawnSync(process.execPath, [script, guideDir], { encoding: 'utf8' });
  assert.equal(none.status, 2);
  assert.match(none.stderr, /--deck/);
});

test('companion-guide passes the repo check', () => {
  assert.deepEqual(checkRepo(root).filter((p) => p.file.startsWith('skills/companion-guide') || p.file.startsWith('evals/companion-guide')), []);
});
