// talk-builder's Google Slides output: the same deck.json and style file become an equivalent
// presentation (image slides, the sentence inside its panel shape, AI labels, alt text, notes),
// built through a stand-in for the Google Workspace CLI, and without the CLI the speaker is told
// and gets the HTML deck.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, cpSync, rmSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { inflateSync } from 'node:zlib';
import {
  slidesRequests, notesRequests, panelOpacity, qrPng, slideId, buildGoogleSlides, gwsCli, checkGws,
  SlidesError, SlidesUnavailable, RECORD_FILE, OUT_DIR,
} from '../skills/talk-builder/scripts/google-slides.mjs';
import { contrast } from '../skills/talk-builder/scripts/style-file.mjs';
import { readStyle } from '../skills/html-slides/scripts/build-deck.mjs';
import { checkRepo } from '../scripts/check-repo.mjs';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const skill = join(root, 'skills', 'talk-builder');
const example = join(skill, 'examples', 'talks');
const exampleDeck = () => JSON.parse(readFileSync(join(example, 'rehearse-with-your-phone', 'slides', 'deck.json'), 'utf8'));
const exampleStyle = () => readStyle(readFileSync(join(example, 'speaker-style.md'), 'utf8'));

const dirs = [];
after(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'google-slides-test-'));
  dirs.push(d);
  return d;
};

// A copy of the example talks folder, with one real PNG on the photorealistic AI slide.
const PNG = qrPng('https://example.com/stand-in-picture');
function exampleTalk(patch = (deck) => deck) {
  const dir = tmp();
  cpSync(example, dir, { recursive: true, filter: (src) => !/index\.html$|[/\\]deck$|deck-check\.json$/.test(src) });
  const deckJson = join(dir, 'rehearse-with-your-phone', 'slides', 'deck.json');
  const deck = exampleDeck();
  deck.slides[1].image = 'images/wince.png';
  mkdirSync(join(dir, 'rehearse-with-your-phone', 'slides', 'images'), { recursive: true });
  writeFileSync(join(dir, 'rehearse-with-your-phone', 'slides', 'images', 'wince.png'), PNG);
  writeFileSync(deckJson, JSON.stringify(patch(deck)));
  return { dir, deckJson, slides: join(dir, 'rehearse-with-your-phone', 'slides') };
}

// A stand-in for gws that answers like Google would and records every call.
function fakeGws({ status = { has_refresh_token: true, scopes: ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/presentations'] }, failBatch = false } = {}) {
  const calls = [];
  let files = 0;
  let created = [];
  const gws = (args) => {
    calls.push(args);
    const json = (flag) => JSON.parse(args[args.indexOf(flag) + 1]);
    const key = args.slice(0, args.findIndex((a) => a.startsWith('--')) >>> 0).join(' ');
    if (key === 'auth status') return status;
    if (key === 'drive files create') return { id: `file${++files}` };
    if (key === 'drive permissions create') return { id: `perm-${json('--params').fileId}` };
    if (key === 'drive permissions delete') return {};
    if (key === 'slides presentations get')
      return {
        pageSize: { width: { magnitude: 9144000 }, height: { magnitude: 5143500 } },
        slides: created.length
          ? created.map((objectId) => ({ objectId, slideProperties: { notesPage: { notesProperties: { speakerNotesObjectId: `${objectId}_notes` } } } }))
          : [{ objectId: 'p' }],
      };
    if (key === 'slides presentations batchUpdate') {
      const { requests } = json('--json');
      if (failBatch && requests.some((r) => r.createSlide)) throw new SlidesError('gws slides presentations batchUpdate failed: invalid request');
      created.push(...requests.filter((r) => r.createSlide).map((r) => r.createSlide.objectId));
      return {};
    }
    if (key === 'slides presentations pages getThumbnail') return { contentUrl: `https://example.com/thumb/${json('--params').pageObjectId}` };
    throw new Error(`unexpected gws call: ${args.join(' ')}`);
  };
  const fetch = async () => ({ ok: true, status: 200, arrayBuffer: async () => PNG });
  const batches = () => calls.filter((a) => a.includes('batchUpdate')).map((a) => JSON.parse(a[a.indexOf('--json') + 1]).requests);
  return { gws, fetch, calls, batches };
}

const byType = (requests, type) => requests.filter((r) => r[type]).map((r) => r[type]);
const onSlide = (requests, i) => byType(requests, 'createShape').concat(byType(requests, 'createImage')).filter((e) => e.elementProperties.pageObjectId === slideId(i));

// --- the slides ---

test('every image slide is a full-bleed picture with its sentence inside a semi-opaque panel shape', () => {
  const deck = exampleDeck();
  deck.slides[1].image = 'images/wince.png';
  const { requests } = slidesRequests(deck, exampleStyle(), { images: { 'images/wince.png': 'https://example.com/wince.png' }, qr: { [deck.slides.at(-1).url]: 'https://example.com/qr.png' } });

  deck.slides.forEach((s, i) => {
    if ((s.type ?? 'image') !== 'image') return;
    const elements = onSlide(requests, i);
    const picture = elements.find((e) => e.objectId === `${slideId(i)}_image`);
    assert.ok(picture, `slide ${i + 1} has no picture or placeholder`);
    assert.equal(picture.elementProperties.size.width.magnitude, 9144000, `slide ${i + 1}: the picture is not full-bleed`);
    if (s.image) assert.equal(picture.url, 'https://example.com/wince.png');

    // The sentence is the panel's own text, not a text box laid over a shape.
    const panel = byType(requests, 'createShape').find((e) => e.objectId === `${slideId(i)}_panel`);
    assert.equal(panel.shapeType, 'RECTANGLE');
    const texts = byType(requests, 'insertText').filter((t) => t.objectId.startsWith(`${slideId(i)}_`));
    assert.deepEqual(texts.filter((t) => t.text === s.sentence).map((t) => t.objectId), [`${slideId(i)}_panel`]);
    const fill = byType(requests, 'updateShapeProperties').find((u) => u.objectId === panel.objectId).shapeProperties.shapeBackgroundFill.solidFill;
    assert.ok(fill.alpha > 0 && fill.alpha < 1, `slide ${i + 1}: panel opacity ${fill.alpha}`);
    assert.equal(byType(requests, 'createShape').filter((e) => e.elementProperties.pageObjectId === slideId(i) && e.shapeType === 'TEXT_BOX').length, 0, `slide ${i + 1}: a loose text box`);

    // Alt text on what stands for the picture.
    assert.equal(byType(requests, 'updatePageElementAltText').find((a) => a.objectId === `${slideId(i)}_image`)?.description, s.alt);
  });
});

test('photorealistic AI images carry an "AI-generated" label in its own shape, others none', () => {
  const deck = exampleDeck();
  const { requests } = slidesRequests(deck, exampleStyle(), { qr: { [deck.slides.at(-1).url]: 'https://example.com/qr.png' } });
  const labelled = byType(requests, 'insertText').filter((t) => t.text === 'AI-generated').map((t) => t.objectId);
  const photos = deck.slides.flatMap((s, i) => (s.ai === 'photo' ? [`${slideId(i)}_ai_label`] : []));
  assert.ok(photos.length, 'the example has no photorealistic AI image');
  assert.deepEqual(labelled, photos);
  for (const id of labelled) {
    assert.equal(byType(requests, 'createShape').find((e) => e.objectId === id).shapeType, 'RECTANGLE');
    const fill = byType(requests, 'updateShapeProperties').find((u) => u.objectId === id).shapeProperties.shapeBackgroundFill.solidFill;
    assert.ok(fill.alpha >= 0.75);
  }
  // An illustration is not labelled on the slide.
  deck.slides[1].ai = 'illustration';
  assert.ok(!slidesRequests(deck, exampleStyle(), { qr: { [deck.slides.at(-1).url]: 'q' } }).requests.some((r) => r.insertText?.text === 'AI-generated'));
});

test('black, sentence-only and QR slides match the HTML deck', () => {
  const deck = exampleDeck();
  const style = exampleStyle();
  const { requests } = slidesRequests(deck, style, { qr: { [deck.slides.at(-1).url]: 'https://example.com/qr.png' } });
  const backgrounds = byType(requests, 'updatePageProperties');
  deck.slides.forEach((s, i) => {
    const bg = backgrounds.find((b) => b.objectId === slideId(i)).pageProperties.pageBackgroundFill.solidFill.color.rgbColor;
    if (s.type === 'black') {
      assert.deepEqual(bg, { red: 0, green: 0, blue: 0 });
      assert.deepEqual(onSlide(requests, i), [], 'the black slide shows something');
    }
  });
  const compare = deck.slides.findIndex((s) => s.compare);
  for (const item of deck.slides[compare].compare) assert.ok(byType(requests, 'insertText').some((t) => t.text === item && t.objectId.startsWith(slideId(compare))));
  const figure = deck.slides.findIndex((s) => s.figure);
  assert.ok(byType(requests, 'insertText').some((t) => t.objectId === `${slideId(figure)}_figure` && t.text === deck.slides[figure].figure));

  const last = deck.slides.length - 1;
  const qr = byType(requests, 'createImage').find((e) => e.objectId === `${slideId(last)}_qr`);
  assert.equal(qr.url, 'https://example.com/qr.png');
  assert.match(byType(requests, 'updatePageElementAltText').find((a) => a.objectId === qr.objectId).description, /^QR code that opens example\.com\/rehearse-with-your-phone$/);
  // Sentence and address are two paragraphs of one text frame.
  assert.equal(byType(requests, 'insertText').find((t) => t.objectId === `${slideId(last)}_sentence`).text, `${deck.slides[last].sentence}\nexample.com/rehearse-with-your-phone`);
});

test('the style file sets the colours and the font', () => {
  const deck = exampleDeck();
  const { requests } = slidesRequests(deck, { ...exampleStyle(), font: "'Atkinson Hyperlegible', sans-serif" }, { qr: { [deck.slides.at(-1).url]: 'q' } });
  const bg = byType(requests, 'updatePageProperties').find((b) => b.objectId === slideId(0)).pageProperties.pageBackgroundFill.solidFill.color.rgbColor;
  assert.deepEqual(bg, { red: 0.106, green: 0.122, blue: 0.141 }); // #1b1f24
  const styles = byType(requests, 'updateTextStyle');
  assert.ok(styles.length && styles.every((s) => s.style.fontFamily === 'Atkinson Hyperlegible' || s.style.fontFamily === 'Roboto Mono'));
});

test('without a blur, the panel is opaque enough for 4.5:1 over any pixel, and never less than its dim', () => {
  for (const [text, panel, worst] of [['#ffffff', '#1b1f24', '#ffffff'], ['#ffffff', '#555555', '#ffffff'], ['#14171c', '#f6f4ef', '#000000']]) {
    const a = panelOpacity(text, panel, 0.3);
    const p = [1, 3, 5].map((k) => parseInt(panel.slice(k, k + 2), 16));
    const w = [1, 3, 5].map((k) => parseInt(worst.slice(k, k + 2), 16));
    const mixed = `#${p.map((c, k) => Math.round(a * c + (1 - a) * w[k]).toString(16).padStart(2, '0')).join('')}`;
    assert.ok(contrast(text, mixed) >= 4.5, `${text} on ${panel} at ${a}: ${contrast(text, mixed).toFixed(2)}:1`);
  }
  assert.equal(panelOpacity('#ffffff', '#1b1f24', 0.9), 0.9);
  assert.ok(panelOpacity('#ffffff', '#555555', 0.62) > 0.62);

  const deck = exampleDeck();
  const { requests, raised } = slidesRequests(deck, { ...exampleStyle(), panel: '#555555' }, { qr: { [deck.slides.at(-1).url]: 'q' } });
  assert.ok(raised.length && raised.every((r) => r.to > r.from));
  const alpha = byType(requests, 'updateShapeProperties').find((u) => u.objectId === `${slideId(0)}_panel`).shapeProperties.shapeBackgroundFill.solidFill.alpha;
  assert.equal(alpha, raised[0].to);
});

test('speaker notes go into each slide\'s own notes box', () => {
  const deck = exampleDeck();
  const presentation = { slides: deck.slides.map((_, i) => ({ objectId: slideId(i), slideProperties: { notesPage: { notesProperties: { speakerNotesObjectId: `n${i}` } } } })) };
  const notes = notesRequests(deck, presentation).map((r) => r.insertText);
  assert.deepEqual(notes, deck.slides.flatMap((s, i) => (s.notes ? [{ objectId: `n${i}`, text: s.notes, insertionIndex: 0 }] : [])));
  assert.throws(() => notesRequests(deck, { slides: [] }), SlidesError);
});

test('the QR code is a PNG that holds the address', () => {
  const png = qrPng('https://example.com/rehearse-with-your-phone');
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const size = png.readUInt32BE(16);
  assert.equal(png.readUInt32BE(20), size);
  const idat = png.indexOf('IDAT');
  const pixels = inflateSync(png.subarray(idat + 4, idat + 4 + png.readUInt32BE(idat - 4)));
  assert.equal(pixels.length, size * (size + 1));
  assert.ok(pixels.includes(0) && pixels.includes(255));
});

// --- the build, through gws ---

test('the talk is built as Google Slides through gws, with the HTML deck next to it', async () => {
  const { deckJson, slides } = exampleTalk();
  const { gws, fetch, calls, batches } = fakeGws();
  const result = await buildGoogleSlides(deckJson, { gws, fetch });

  assert.equal(result.url, `https://docs.google.com/presentation/d/${result.presentationId}/edit`);
  assert.ok(existsSync(join(slides, 'index.html')), 'no HTML deck');
  assert.equal(result.throughline, 'Your phone is the rehearsal coach you already own.');

  // The picture went to Drive, readable by link only while the slides were built.
  const uploads = calls.filter((a) => a.includes('--upload'));
  assert.ok(uploads.some((a) => a[a.indexOf('--upload') + 1].endsWith('wince.png') && a.includes('image/png')));
  const shared = calls.filter((a) => a[1] === 'permissions' && a[2] === 'create').length;
  assert.ok(shared >= 2, 'the picture and the QR code');
  assert.equal(calls.filter((a) => a[1] === 'permissions' && a[2] === 'delete').length, shared);
  assert.ok(calls.findIndex((a) => a[2] === 'delete') > calls.findIndex((a) => a.includes('batchUpdate')));

  const [build, notes] = batches();
  assert.equal(build.filter((r) => r.createSlide).length, 7);
  assert.deepEqual(build.at(-1), { deleteObject: { objectId: 'p' } });
  assert.equal(notes.length, exampleDeck().slides.filter((s) => s.notes).length);

  const record = JSON.parse(readFileSync(join(slides, RECORD_FILE), 'utf8'));
  assert.equal(record.url, result.url);
  assert.deepEqual(readdirSync(join(slides, OUT_DIR)), Array.from({ length: 7 }, (_, i) => `slide-0${i + 1}.png`));
});

test('a failed build still takes the link sharing off every uploaded picture', async () => {
  const { deckJson } = exampleTalk();
  const { gws, fetch, calls } = fakeGws({ failBatch: true });
  await assert.rejects(buildGoogleSlides(deckJson, { gws, fetch }), SlidesError);
  const shared = calls.filter((a) => a[1] === 'permissions' && a[2] === 'create').length;
  assert.ok(shared > 0);
  assert.equal(calls.filter((a) => a[1] === 'permissions' && a[2] === 'delete').length, shared);
});

test('images Google Slides cannot take are refused before anything is uploaded', async () => {
  const { deckJson, slides } = exampleTalk((deck) => {
    deck.slides[2].image = 'images/kit.svg';
    return deck;
  });
  writeFileSync(join(slides, 'images', 'kit.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  const { gws, fetch, calls } = fakeGws();
  await assert.rejects(buildGoogleSlides(deckJson, { gws, fetch }), (e) => e instanceof SlidesError && /PNG, JPEG or GIF/.test(e.message) && /kit\.svg/.test(e.message));
  assert.deepEqual(calls.map((a) => a.slice(0, 2).join(' ')), ['auth status']);
});

test('the talk-builder gates hold for Google Slides too', async () => {
  const { deckJson, dir } = exampleTalk();
  rmSync(join(dir, 'rehearse-with-your-phone', 'storyboard-critique.md'));
  const { gws, fetch, calls } = fakeGws();
  await assert.rejects(buildGoogleSlides(deckJson, { gws, fetch }), /storyboard-critique\.md/);
  assert.deepEqual(calls, []);
});

// --- without gws ---

test('without a login, or without Slides access, Google Slides is unavailable', () => {
  assert.throws(() => checkGws(fakeGws({ status: { has_refresh_token: false } }).gws), SlidesUnavailable);
  assert.throws(() => checkGws(fakeGws({ status: { has_refresh_token: true, scopes: ['https://www.googleapis.com/auth/drive'] } }).gws), SlidesUnavailable);
  assert.doesNotThrow(() => checkGws(fakeGws({ status: { has_refresh_token: true, scopes: ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/presentations'] } }).gws));
  assert.throws(() => gwsCli(join(tmp(), 'no-gws-here'))(['auth', 'status']), SlidesUnavailable);
});

test('without the CLI the speaker is told so and gets the HTML deck', () => {
  const { deckJson, slides } = exampleTalk();
  const run = spawnSync(process.execPath, [join(skill, 'scripts', 'google-slides.mjs'), deckJson], {
    encoding: 'utf8',
    env: { ...process.env, GWS_PATH: join(tmp(), 'no-gws-here') },
  });
  assert.equal(run.status, 3, run.stderr);
  assert.match(run.stderr, /Google Workspace CLI \(gws\) is not installed/);
  assert.match(run.stderr, /HTML deck is built/);
  assert.match(run.stderr, /references\/google-slides\.md/);
  assert.ok(existsSync(join(slides, 'index.html')));
  assert.ok(!existsSync(join(slides, RECORD_FILE)));
});

test('the Google Slides setup is documented and passes the repo check', () => {
  const setup = readFileSync(join(skill, 'references', 'google-slides.md'), 'utf8');
  for (const step of [/npm install -g @googleworkspace\/cli/, /gws auth setup/, /gws auth login -s drive,slides/, /gws auth status/, /Test users/i])
    assert.match(setup, step);
  assert.match(readFileSync(join(skill, 'SKILL.md'), 'utf8'), /scripts\/google-slides\.mjs/);
  assert.deepEqual(checkRepo(root).filter((p) => p.file.startsWith('skills/talk-builder') || p.file.startsWith('test/google-slides')), []);
});
