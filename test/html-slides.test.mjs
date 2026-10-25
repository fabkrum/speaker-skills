// html-slides: the deck a speaker gets, and the artefact check that grades it in a real browser.
// Needs a Chromium-based browser (Chrome on macOS and on GitHub's Ubuntu runners).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, cpSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { buildDeck, renderDeck, readStyle, DeckError } from '../skills/html-slides/scripts/build-deck.mjs';
import { checkDeck, MIN_CONTRAST } from '../skills/html-slides/scripts/check-deck.mjs';
import { launch, openPage } from '../skills/html-slides/scripts/browser.mjs';
import { checkRepo } from '../scripts/check-repo.mjs';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const skill = join(root, 'skills', 'html-slides');
const sample = join(skill, 'examples', 'sample');

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
  const d = mkdtempSync(join(tmpdir(), 'html-slides-test-'));
  dirs.push(d);
  return d;
};

const svg = (fill) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080"><rect width="1920" height="1080" fill="${fill}"/></svg>`;

// A deck folder with a white and a dark image, built from the given slides.
function makeDeck(slides, { style } = {}) {
  const dir = tmp();
  cpSync(join(sample, 'images'), join(dir, 'images'), { recursive: true });
  writeFileSync(join(dir, 'images', 'white.svg'), svg('#ffffff'));
  writeFileSync(join(dir, 'images', 'dark.svg'), svg('#202020'));
  if (style) writeFileSync(join(dir, 'speaker-style.md'), style);
  writeFileSync(join(dir, 'deck.json'), JSON.stringify({ title: 'Test deck', slides }));
  buildDeck(join(dir, 'deck.json'));
  return dir;
}

const edit = (dir, from, to) => {
  const file = join(dir, 'index.html');
  const html = readFileSync(file, 'utf8');
  assert.ok(html.includes(from), `index.html does not contain ${from}`);
  writeFileSync(file, html.replace(from, to));
};

const checks = (report) => report.problems.map((p) => p.check);

const photo = { type: 'image', image: 'images/dark.svg', alt: 'A dark room', sentence: 'The room goes quiet.', ai: 'photo' };

test('the sample deck builds and passes the check offline', async () => {
  const dir = tmp();
  cpSync(sample, dir, { recursive: true, filter: (src) => !/index\.html$|[/\\]deck$|deck-check\.json$/.test(src) });
  const { slides, styleFile } = buildDeck(join(dir, 'deck.json'));
  assert.equal(slides, 6);
  assert.ok(styleFile.endsWith('speaker-style.md'), 'the sample style file was not read');
  for (const f of ['index.html', 'deck/deck.css', 'deck/deck.js', 'deck/qrcode.js']) assert.ok(existsSync(join(dir, f)), `${f} missing`);
  const html = readFileSync(join(dir, 'index.html'), 'utf8');
  assert.doesNotMatch(html, /(src|href)="(https?:)?\/\//, 'the deck links to the network');

  const report = await checkDeck(dir, { browser });
  assert.deepEqual(report.problems, []);
  assert.equal(report.passed, true);
  assert.equal(report.slides, 6);
  assert.ok(report.contrast.length >= 6, 'not every slide text was measured');
  assert.ok(report.lowestContrast >= MIN_CONTRAST);
});

test('the sample deck carries every slide type', () => {
  const deck = JSON.parse(readFileSync(join(sample, 'deck.json'), 'utf8'));
  const types = new Set(deck.slides.map((s) => s.type));
  for (const t of ['image', 'text', 'black', 'qr']) assert.ok(types.has(t), `no ${t} slide in the sample`);
});

test('the check fails a panel whose text falls below 4.5:1 against the image', async () => {
  const slide = { type: 'image', image: 'images/white.svg', alt: 'A white wall', sentence: 'White on white is unreadable.' };
  const faint = await checkDeck(makeDeck([{ ...slide, dim: 0.1 }]), { browser });
  assert.equal(faint.passed, false);
  const problem = faint.problems.find((p) => p.check === 'contrast');
  assert.ok(problem, 'no contrast problem reported');
  assert.equal(problem.slide, 1);
  assert.ok(faint.lowestContrast < MIN_CONTRAST, `measured ${faint.lowestContrast}:1`);

  const dimmed = await checkDeck(makeDeck([slide]), { browser });
  assert.deepEqual(dimmed.problems, []);
});

test('the check measures what is behind the text, not the stylesheet', async () => {
  // A light scheme with dark text passes over a white image, and fails over a dark one.
  const style = '---\nscheme: light\ntext: "#14171c"\n---\n';
  const slide = { type: 'image', alt: 'A wall', sentence: 'Dark text needs a light panel.', dim: 0.05 };
  const light = await checkDeck(makeDeck([{ ...slide, image: 'images/white.svg' }], { style }), { browser });
  assert.deepEqual(light.problems, []);
  const dark = await checkDeck(makeDeck([{ ...slide, image: 'images/dark.svg' }], { style }), { browser });
  assert.deepEqual(checks(dark), ['contrast']);
});

test('a photorealistic AI image gets a label the check accepts', async () => {
  const dir = makeDeck([photo]);
  assert.match(readFileSync(join(dir, 'index.html'), 'utf8'), /class="ai-label[^"]*">AI-generated</);
  const report = await checkDeck(dir, { browser });
  assert.deepEqual(report.problems, []);
});

test('the check fails a photorealistic AI image without a visible label', async () => {
  const removed = makeDeck([photo]);
  edit(removed, '<p class="ai-label">AI-generated</p>', '');
  assert.deepEqual(checks(await checkDeck(removed, { browser })), ['ai-label']);

  const hidden = makeDeck([photo]);
  edit(hidden, '<p class="ai-label">', '<p class="ai-label" style="display: none">');
  assert.deepEqual(checks(await checkDeck(hidden, { browser })), ['ai-label']);

  const covered = makeDeck([{ ...photo, panel: 'top-right' }]);
  edit(covered, 'class="ai-label ai-label--bottom"', 'class="ai-label" style="z-index: 0; top: 4.5cqw; right: 4cqw"');
  assert.ok(checks(await checkDeck(covered, { browser })).includes('ai-label'), 'a label under the panel passed');

  const mentioned = makeDeck([{ ...photo, sentence: 'AI-generated images need a label, says the AI Act.' }]);
  edit(mentioned, '<p class="ai-label">AI-generated</p>', '');
  assert.deepEqual(checks(await checkDeck(mentioned, { browser })), ['ai-label'], 'a sentence counted as the label');

  const tiny = makeDeck([photo]);
  edit(tiny, '<p class="ai-label">', '<p class="ai-label" style="font-size: 8px">');
  assert.deepEqual(checks(await checkDeck(tiny, { browser })), ['ai-label']);
});

test('illustrations need no slide label', async () => {
  const report = await checkDeck(makeDeck([{ ...photo, ai: 'illustration' }]), { browser });
  assert.deepEqual(report.problems, []);
  assert.doesNotMatch(readFileSync(join(report.deck), 'utf8'), /ai-label/);
});

test('the check fails an image without alt text', async () => {
  const empty = makeDeck([photo]);
  edit(empty, 'alt="A dark room"', 'alt=""');
  assert.deepEqual(checks(await checkDeck(empty, { browser })), ['alt']);

  const missing = makeDeck([photo]);
  edit(missing, ' alt="A dark room"', '');
  assert.deepEqual(checks(await checkDeck(missing, { browser })), ['alt']);

  const css = makeDeck([{ type: 'text', sentence: 'A slide with a CSS background.' }]);
  edit(css, '<section class="slide slide--text"', '<section style="background-image: url(images/dark.svg)" class="slide slide--text"');
  assert.deepEqual(checks(await checkDeck(css, { browser })), ['alt']);
});

test('the check fails anything that scrolls sideways at 390 px', async () => {
  const dir = makeDeck([{ type: 'text', sentence: 'A wide thing.', figure: '42' }]);
  edit(dir, '<p class="slide__figure">', '<p class="slide__figure" style="width: 600px">');
  const report = await checkDeck(dir, { browser });
  assert.deepEqual(checks(report), ['phone']);
  assert.match(report.problems[0].message, /390 px/);
});

test('long sentences, code and URLs wrap instead of scrolling at 390 px', async () => {
  const long = 'Averyveryverylongwordwithoutanybreakopportunitythatkeepsgoingandgoingandgoing';
  const report = await checkDeck(
    makeDeck([
      { type: 'image', image: 'images/dark.svg', alt: 'Dark', sentence: `${long} in a sentence.`, panel: 'bottom' },
      { type: 'text', sentence: 'Code wraps.', code: `npx ${long} --flag=${long}` },
      { type: 'text', sentence: 'Comparisons fit.', compare: ['Before: forty slides of bullets', 'After: twelve images'] },
      { type: 'qr', sentence: 'The guide.', url: `https://example.com/${long}/${long}` },
    ]),
    { browser },
  );
  assert.deepEqual(report.problems, []);
});

test('the check fails a deck that loads from the network', async () => {
  const dir = makeDeck([{ type: 'text', sentence: 'Offline or nothing.' }]);
  edit(dir, '<link rel="stylesheet" href="deck/deck.css">', '<link rel="stylesheet" href="deck/deck.css"><link rel="stylesheet" href="http://127.0.0.1:9/font.css">');
  assert.deepEqual(checks(await checkDeck(dir, { browser })), ['offline']);
});

test('the keyboard drives the deck: arrows, Home, End, and B for black', async () => {
  const dir = makeDeck([
    { type: 'text', sentence: 'One.' },
    { type: 'black' },
    { type: 'qr', sentence: 'Three.', url: 'https://example.com/guide' },
  ]);
  const page = await openPage(browser, { width: 1280, height: 720 });
  await page.goto(pathToFileURL(join(dir, 'index.html')).href);
  const state = () => page.evaluate('({ index: deck.index, blacked: deck.blacked, hash: location.hash, shown: document.querySelectorAll(".slide.is-current").length })');

  assert.deepEqual(await state(), { index: 0, blacked: false, hash: '', shown: 1 });
  await page.key('ArrowRight', 'ArrowRight', 39);
  assert.equal((await state()).index, 1);
  assert.equal((await state()).hash, '#2');
  await page.key('b', 'KeyB', 66);
  assert.equal((await state()).blacked, true);
  await page.key('b', 'KeyB', 66);
  assert.equal((await state()).blacked, false);
  await page.key('End', 'End', 35);
  assert.equal((await state()).index, 2);
  await page.key('ArrowRight', 'ArrowRight', 39);
  assert.equal((await state()).index, 2, 'moved past the last slide');
  await page.key('Home', 'Home', 36);
  assert.equal((await state()).index, 0);
  await page.key('ArrowLeft', 'ArrowLeft', 37);
  assert.equal((await state()).index, 0, 'moved before the first slide');
  await page.key('.', 'Period', 190);
  assert.equal((await state()).blacked, true, 'a clicker\'s "." key did not black the screen');
  await page.key('ArrowRight', 'ArrowRight', 39);
  assert.deepEqual(await state(), { index: 1, blacked: false, hash: '#2', shown: 1 });

  await page.goto(pathToFileURL(join(dir, 'index.html')).href + '#3');
  assert.equal((await state()).index, 2, 'a reload did not keep the slide');
});

test('the builder escapes text and keeps notes off the screen', () => {
  const html = renderDeck({
    title: 'A <b> title',
    slides: [{ type: 'text', sentence: 'Use <script> & "quotes".', code: '<div class="x">', notes: 'Pause <here>.' }],
  });
  assert.match(html, /Use &lt;script&gt; &amp; &quot;quotes&quot;\./);
  assert.match(html, /<code>&lt;div class=&quot;x&quot;&gt;<\/code>/);
  assert.match(html, /<title>A &lt;b&gt; title<\/title>/);
  assert.match(html, /<aside class="notes">Pause &lt;here&gt;\.<\/aside>/);
});

test('the builder refuses a deck the check would fail anyway', () => {
  const build = (slide) => () => renderDeck({ title: 'T', slides: [slide] });
  assert.throws(build({ type: 'image', image: 'a.svg', sentence: 'S.' }), DeckError, 'image without alt');
  assert.throws(build({ type: 'image', image: 'a.svg', alt: 'A', sentence: 'S.', ai: 'yes' }), DeckError, 'unknown ai value');
  assert.throws(build({ type: 'qr', sentence: 'S.' }), DeckError, 'QR without url');
  assert.throws(build({ type: 'text', sentence: 'S.', figure: '1', code: 'x' }), DeckError, 'two main elements');
  assert.throws(build({ type: 'video', sentence: 'S.' }), DeckError, 'unknown type');
});

test('an image slide without a picture gets a placeholder', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'deck.json'), JSON.stringify({
    title: 'Storyboard first',
    slides: [{ type: 'image', placeholder: 'a crowded harbour at dawn', alt: 'A crowded harbour at dawn', sentence: 'Ports never sleep.' }],
  }));
  buildDeck(join(dir, 'deck.json'));
  const html = readFileSync(join(dir, 'index.html'), 'utf8');
  assert.match(html, /src="images\/placeholder-01\.svg"/);
  assert.match(readFileSync(join(dir, 'images', 'placeholder-01.svg'), 'utf8'), /a crowded harbour at dawn/);
});

test('the speaker\'s style file sets colours and fonts', () => {
  const style = readStyle('---\nscheme: light\nbackground: "#fafafa"\ntext: "#111111"\naccent: "#0072b2"\nfont: Atkinson Hyperlegible, sans-serif\nmotif: boats\n---\nNotes.\n');
  assert.deepEqual(style, { scheme: 'light', background: '#fafafa', text: '#111111', accent: '#0072b2', font: 'Atkinson Hyperlegible, sans-serif', motif: 'boats' });
  const html = renderDeck({ title: 'T', slides: [{ type: 'text', sentence: 'S.' }] }, style);
  assert.match(html, /--deck-bg: #fafafa;/);
  assert.match(html, /--deck-text: #111111;/);
  assert.match(html, /--deck-font: Atkinson Hyperlegible, sans-serif;/);
  assert.throws(() => renderDeck({ title: 'T', slides: [{ type: 'text', sentence: 'S.' }] }, { text: 'red' }), DeckError);
});

test('html-slides passes the repo check', () => {
  const problems = checkRepo(root).filter((p) => p.file.startsWith('skills/html-slides') || p.file.startsWith('evals/'));
  assert.deepEqual(problems, []);
});

test('the skill does not present its deck as Google\'s design', () => {
  for (const f of ['SKILL.md', 'assets/deck/deck.css', 'assets/deck/deck.js'])
    assert.doesNotMatch(readFileSync(join(skill, f), 'utf8'), /Google'?s? (design|style|look)|Material|I\/O|Expressive|GDE/i, f);
});

test('the eval case builds a deck from a storyboard and grades it with the check', () => {
  const text = readFileSync(join(root, 'evals', 'html-slides-storyboard', 'case.yaml'), 'utf8');
  assert.match(text, /^schema_version:/m);
  assert.match(text, /check-deck/, 'no grader looks for the check being run');
  assert.match(text, /deck-check\.json/, 'no grader reads the check report');
  assert.ok(text.includes(`'"passed":\\s*true'`), 'no grader requires the check to pass');
});
