#!/usr/bin/env node
// Builds the talk's deck as a Google Slides presentation, from the same deck.json and style file
// as the HTML deck, through the Google Workspace CLI (gws) and the speaker's own Google login:
//   node google-slides.mjs <talk folder>/slides/deck.json [--style <speaker-style.md>]
// Runs the talk-builder gates and builds the HTML deck first (build-talk.mjs), so the speaker
// always has the offline deck too. Then, if gws is installed and logged in, it creates a Drive
// folder with the presentation and its images, and exports every slide as a PNG into
// <deck folder>/google-slides/ to look at. Exit 3 means Google Slides is not available here
// (no gws, or no login); the HTML deck is built and the message says so.
//
// Equivalent, not identical: Google Slides has no blur behind the panel, so the panel gets at
// least the opacity that keeps the sentence at 4.5:1 over any pixel of the picture.

import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join, resolve, relative, extname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { buildTalk, TalkError } from './build-talk.mjs';
import { readStyle, findStyle, SCHEMES } from '../../html-slides/scripts/build-deck.mjs';
import { contrast, MIN_CONTRAST } from './style-file.mjs';

const require = createRequire(import.meta.url);
const qrcode = require('../../html-slides/assets/deck/qrcode.js');

export const OUT_DIR = 'google-slides';
export const RECORD_FILE = 'google-slides.json';
export const IMAGE_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif' };
const SETUP = "references/google-slides.md in the talk-builder skill's folder";

export class SlidesError extends Error {}
export class SlidesUnavailable extends Error {}

// --- colours and the panel ---

const HEX = /^#(?:[0-9a-f]{3}){1,2}$/i;
const full = (hex) => (hex.length === 4 ? `#${[...hex.slice(1)].map((c) => c + c).join('')}` : hex).toLowerCase();
const channels = (hex) => [1, 3, 5].map((i) => parseInt(full(hex).slice(i, i + 2), 16));
const toHex = (rgb) => `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
const rgbColor = (hex) => {
  const [red, green, blue] = channels(hex).map((c) => Math.round((c / 255) * 1000) / 1000);
  return { red, green, blue };
};

export function colours(style = {}) {
  const scheme = SCHEMES[style.scheme] ?? SCHEMES.dark;
  const pick = (key, fallback) => (HEX.test(style[key] ?? '') ? style[key] : fallback);
  const background = pick('background', scheme.background);
  return {
    background,
    text: pick('text', scheme.text),
    accent: pick('accent', scheme.accent),
    panel: pick('panel', HEX.test(style.background ?? '') ? style.background : scheme.panel),
    dim: style.scheme === 'light' ? 0.74 : 0.62,
  };
}

// The panel's opacity over a picture with no blur behind it: the slide's own dim, raised until
// the text reaches 4.5:1 even where the picture is pure white (light text) or black (dark text).
export function panelOpacity(text, panel, dim) {
  const worst = contrast(text, '#ffffff') < contrast(text, '#000000') ? [255, 255, 255] : [0, 0, 0];
  const p = channels(panel);
  for (let step = Math.ceil(dim * 100); step <= 100; step++) {
    const a = step / 100;
    if (contrast(text, toHex(p.map((c, i) => a * c + (1 - a) * worst[i]))) >= MIN_CONTRAST) return a;
  }
  return 1;
}

// --- the QR code, as a PNG Google Slides can take ---

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

export function qrPng(url, { cell = 12, margin = 4 } = {}) {
  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  const count = qr.getModuleCount();
  const size = (count + 2 * margin) * cell;
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(size + 1, 255);
    row[0] = 0; // filter: none
    const my = Math.floor(y / cell) - margin;
    for (let x = 0; x < size; x++) {
      const mx = Math.floor(x / cell) - margin;
      if (my >= 0 && my < count && mx >= 0 && mx < count && qr.isDark(my, mx)) row[x + 1] = 0;
    }
    rows.push(row);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 0; // greyscale
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- the requests: one batchUpdate that builds every slide ---

export const slideId = (i) => `tb_slide_${String(i + 1).padStart(2, '0')}`;
const EMU_PER_PT = 12700;
const INSET = 91440; // what Google Slides keeps inside a shape's text frame, 0.1 in each side
const MARGIN = 144000; // the inner margin we want, about 0.4 cm
const firstFamily = (css) => css?.split(',')[0].trim().replace(/^(['"])(.*)\1$/, '$2') || undefined;

export function slidesRequests(deck, style = {}, { page = { width: 9144000, height: 5143500 }, images = {}, qr = {} } = {}) {
  const c = colours(style);
  const font = firstFamily(style.font);
  const codeFont = firstFamily(style['code-font']) ?? 'Roboto Mono';
  const W = page.width;
  const H = page.height;
  const u = W / 100; // one percent of the slide's width, the unit the HTML deck is laid out in
  const pt = (cqw) => Math.round(((cqw * u) / EMU_PER_PT) * 10) / 10;
  const requests = [];
  const raised = [];

  const shape = (id, pageId, [x, y, w, h], type = 'TEXT_BOX') => ({
    createShape: {
      objectId: id,
      shapeType: type,
      elementProperties: {
        pageObjectId: pageId,
        size: { width: { magnitude: Math.round(w), unit: 'EMU' }, height: { magnitude: Math.round(h), unit: 'EMU' } },
        transform: { scaleX: 1, scaleY: 1, translateX: Math.round(x), translateY: Math.round(y), unit: 'EMU' },
      },
    },
  });
  const fill = (hex, alpha = 1) => ({ solidFill: { color: { rgbColor: rgbColor(hex) }, alpha } });

  // A shape that carries its own text: the text goes into the shape's text frame, never into a
  // second box laid over it. Word wrap is on by default, and Google Slides turns autofit off
  // itself once text is inserted and styled; the margins are real.
  function textShape(id, pageId, rect, paragraphs, { type = 'RECTANGLE', background, alpha, anchor = 'MIDDLE', align = 'START', outline } = {}) {
    const text = paragraphs.map((p) => p.text).join('\n');
    requests.push(shape(id, pageId, rect, type), { insertText: { objectId: id, text, insertionIndex: 0 } });
    let start = 0;
    for (const p of paragraphs) {
      const end = start + p.text.length;
      const style = {
        fontSize: { magnitude: p.size, unit: 'PT' },
        bold: p.bold ?? false,
        foregroundColor: { opaqueColor: { rgbColor: rgbColor(p.color) } },
      };
      const fields = ['fontSize', 'bold', 'foregroundColor'];
      const family = p.font ?? font;
      if (family) {
        style.fontFamily = family;
        fields.push('fontFamily');
      }
      if (end > start)
        requests.push({ updateTextStyle: { objectId: id, textRange: { type: 'FIXED_RANGE', startIndex: start, endIndex: end }, style, fields: fields.join(',') } });
      start = end + 1;
    }
    const indent = { magnitude: (MARGIN - INSET) / EMU_PER_PT, unit: 'PT' };
    requests.push({
      updateParagraphStyle: {
        objectId: id,
        textRange: { type: 'ALL' },
        style: { alignment: align, lineSpacing: 115, indentStart: indent, indentEnd: indent, indentFirstLine: indent },
        fields: 'alignment,lineSpacing,indentStart,indentEnd,indentFirstLine',
      },
    });
    const properties = {
      contentAlignment: anchor,
      outline: outline ?? { propertyState: 'NOT_RENDERED' },
      shapeBackgroundFill: background ? fill(background, alpha) : { propertyState: 'NOT_RENDERED' },
    };
    requests.push({
      updateShapeProperties: {
        objectId: id,
        shapeProperties: properties,
        fields: 'contentAlignment,outline,shapeBackgroundFill',
      },
    });
  }

  // How much room a text needs: a rough measure (half an em per character), enough to size
  // a panel so the sentence wraps into the lines it would take in the HTML deck.
  const measure = (text, size, maxWidth, lineHeight = 1.25) => {
    const em = size * EMU_PER_PT;
    const inner = maxWidth - 2 * MARGIN;
    const lines = String(text).split('\n').reduce((n, line) => n + Math.max(1, Math.ceil((line.length * 0.52 * em) / inner)), 0);
    const width = lines > String(text).split('\n').length ? maxWidth : Math.min(maxWidth, String(text).length * 0.52 * em + 2 * MARGIN + em);
    return { width, height: lines * em * lineHeight + 2 * INSET + em * 0.4, lines };
  };

  const background = (pageId, hex) =>
    requests.push({
      updatePageProperties: { objectId: pageId, pageProperties: { pageBackgroundFill: fill(hex) }, fields: 'pageBackgroundFill.solidFill.color' },
    });
  const altText = (objectId, description) => requests.push({ updatePageElementAltText: { objectId, description } });

  deck.slides.forEach((s, i) => {
    const id = slideId(i);
    const type = s.type ?? 'image';
    requests.push({ createSlide: { objectId: id, insertionIndex: i, slideLayoutReference: { predefinedLayout: 'BLANK' } } });
    background(id, type === 'black' ? '#000000' : c.background);

    if (type === 'image') {
      if (s.image) {
        if (!images[s.image]) throw new SlidesError(`slide ${i + 1}: image ${s.image} was not uploaded`);
        requests.push({
          createImage: {
            objectId: `${id}_image`,
            url: images[s.image],
            elementProperties: {
              pageObjectId: id,
              size: { width: { magnitude: W, unit: 'EMU' }, height: { magnitude: H, unit: 'EMU' } },
              transform: { scaleX: 1, scaleY: 1, translateX: 0, translateY: 0, unit: 'EMU' },
            },
          },
        });
        altText(`${id}_image`, s.alt);
      } else {
        // No picture yet: a full-slide placeholder that says what is to come, like the HTML deck.
        textShape(`${id}_image`, id, [0, 0, W, H], [{ text: `Image to come: ${s.placeholder ?? s.alt}`, size: pt(2), color: c.text }], {
          background: c.background,
          anchor: 'TOP',
        });
        altText(`${id}_image`, s.alt);
      }

      const where = s.panel ?? 'bottom-left';
      const size = pt(2.5);
      const box = measure(s.sentence, size, 76 * u);
      const x = where.endsWith('left') ? 4 * u : where.endsWith('right') ? W - 4 * u - box.width : (W - box.width) / 2;
      const y = where.startsWith('top') ? 4.5 * u : H - 4.5 * u - box.height;
      const dim = s.dim ?? c.dim;
      const alpha = panelOpacity(c.text, c.panel, dim);
      if (alpha > dim) raised.push({ slide: i + 1, from: dim, to: alpha });
      textShape(`${id}_panel`, id, [x, y, box.width, box.height], [{ text: s.sentence, size, bold: true, color: c.text }], {
        background: c.panel,
        alpha,
        align: where === 'top' || where === 'bottom' ? 'CENTER' : 'START',
      });

      if (s.ai === 'photo') {
        const label = measure('AI-generated', pt(1.4), 30 * u, 1.2);
        const lx = where.startsWith('top') ? 1.6 * u : W - 1.6 * u - label.width;
        const ly = where.startsWith('top') ? H - 1.6 * u - label.height : 1.6 * u;
        textShape(`${id}_ai_label`, id, [lx, ly, label.width, label.height], [{ text: 'AI-generated', size: pt(1.4), bold: true, color: '#ffffff' }], {
          background: '#000000',
          alpha: 0.78,
        });
      }
    } else if (type === 'text') {
      const left = 8 * u;
      const width = 84 * u;
      const parts = [];
      const sentence = measure(s.sentence, pt(3.2), 70 * u);
      parts.push({ height: sentence.height, draw: (y) => textShape(`${id}_sentence`, id, [left, y, 70 * u, sentence.height], [{ text: s.sentence, size: pt(3.2), bold: true, color: c.text }], { type: 'TEXT_BOX' }) });
      if (s.figure !== undefined) {
        const figure = measure(String(s.figure), pt(12), width, 1);
        parts.push({ height: figure.height, draw: (y) => textShape(`${id}_figure`, id, [left, y, width, figure.height], [{ text: String(s.figure), size: pt(12), bold: true, color: c.accent }], { type: 'TEXT_BOX' }) });
      }
      if (s.code !== undefined) {
        const code = measure(s.code, pt(2), width, 1.4);
        parts.push({
          height: code.height,
          draw: (y) =>
            textShape(`${id}_code`, id, [left, y, width, code.height], [{ text: s.code, size: pt(2), color: c.text, font: codeFont }], {
              background: '#ffffff',
              alpha: 0.08,
              anchor: 'TOP',
            }),
        });
      }
      if (s.compare) {
        const gap = 3 * u;
        const cardWidth = (width - gap * (s.compare.length - 1)) / s.compare.length;
        const height = Math.max(...s.compare.map((item) => measure(item, pt(2.5), cardWidth, 1.3).height));
        parts.push({
          height: height + 0.3 * u,
          draw: (y) =>
            s.compare.forEach((item, k) => {
              const x = left + k * (cardWidth + gap);
              // The accent rule above each item is decoration and carries no text.
              requests.push(shape(`${id}_rule_${k + 1}`, id, [x, y, cardWidth, 0.3 * u], 'RECTANGLE'), {
                updateShapeProperties: {
                  objectId: `${id}_rule_${k + 1}`,
                  shapeProperties: { shapeBackgroundFill: fill(c.accent), outline: { propertyState: 'NOT_RENDERED' } },
                  fields: 'shapeBackgroundFill,outline',
                },
              });
              textShape(`${id}_compare_${k + 1}`, id, [x, y + 0.3 * u, cardWidth, height], [{ text: item, size: pt(2.5), color: c.text }], { type: 'TEXT_BOX', anchor: 'TOP' });
            }),
        });
      }
      const gap = 2.5 * u;
      let y = (H - parts.reduce((sum, p) => sum + p.height, 0) - gap * (parts.length - 1)) / 2;
      for (const p of parts) {
        p.draw(y);
        y += p.height + gap;
      }
    } else if (type === 'qr') {
      const side = 26 * u;
      const shown = s.url.replace(/^https?:\/\//, '').replace(/\/$/, '');
      if (!qr[s.url]) throw new SlidesError(`slide ${i + 1}: the QR code for ${s.url} was not uploaded`);
      textShape(
        `${id}_sentence`,
        id,
        [8 * u, 6 * u, W - 16 * u - side - 5 * u, H - 12 * u],
        [
          { text: s.sentence, size: pt(3.2), bold: true, color: c.text },
          { text: shown, size: pt(2), color: c.accent },
        ],
        { type: 'TEXT_BOX' },
      );
      requests.push({
        createImage: {
          objectId: `${id}_qr`,
          url: qr[s.url],
          elementProperties: {
            pageObjectId: id,
            size: { width: { magnitude: Math.round(side), unit: 'EMU' }, height: { magnitude: Math.round(side), unit: 'EMU' } },
            transform: { scaleX: 1, scaleY: 1, translateX: Math.round(W - 8 * u - side), translateY: Math.round((H - side) / 2), unit: 'EMU' },
          },
        },
      });
      altText(`${id}_qr`, `QR code that opens ${shown}`);
    }
  });
  return { requests, raised };
}

// Speaker notes live on each slide's notes page, in a shape whose id Google Slides picks, so
// they go in a second batch, once the presentation says which ids it chose.
export function notesRequests(deck, presentation) {
  const pages = new Map((presentation.slides ?? []).map((p) => [p.objectId, p]));
  return deck.slides.flatMap((s, i) => {
    if (!s.notes) return [];
    const objectId = pages.get(slideId(i))?.slideProperties?.notesPage?.notesProperties?.speakerNotesObjectId;
    if (!objectId) throw new SlidesError(`slide ${i + 1}: Google Slides returned no speaker notes box`);
    return [{ insertText: { objectId, text: s.notes, insertionIndex: 0 } }];
  });
}

// --- gws ---

const NO_CLI =
  'the Google Workspace CLI (gws) is not installed, or not on the PATH. Google Slides needs it, with your own Google login.';
const NO_LOGIN = 'gws is installed but not logged in to Google with Drive and Slides access.';

export function gwsCli(command = process.env.GWS_PATH || 'gws') {
  return (args) => {
    const run = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (run.error?.code === 'ENOENT') throw new SlidesUnavailable(NO_CLI);
    if (run.error) throw new SlidesError(`gws could not run: ${run.error.message}`);
    const out = run.stdout.trim();
    if (run.status !== 0) {
      const why = (run.stderr.trim() || out).split('\n').slice(-6).join('\n');
      throw new SlidesError(`gws ${args.filter((a) => !a.startsWith('{')).join(' ')} failed:\n${why}`);
    }
    const start = out.search(/[{[]/);
    return start === -1 ? {} : JSON.parse(out.slice(start));
  };
}

export function checkGws(gws) {
  let status;
  try {
    status = gws(['auth', 'status']);
  } catch (e) {
    if (e instanceof SlidesUnavailable) throw e;
    throw new SlidesUnavailable(`${NO_LOGIN} (${e.message.split('\n')[0]})`);
  }
  const token = Boolean(process.env.GOOGLE_WORKSPACE_CLI_TOKEN);
  if (!token && status.has_refresh_token === false) throw new SlidesUnavailable(NO_LOGIN);
  const scopes = status.scopes ?? [];
  const has = (name) => scopes.some((s) => new RegExp(`/auth/${name}(\\.file)?$`).test(s));
  if (!token && scopes.length && !(has('drive') && has('presentations')))
    throw new SlidesUnavailable(`${NO_LOGIN} Log in again with Drive and Slides selected.`);
}

const FOLDER = 'application/vnd.google-apps.folder';
const PRESENTATION = 'application/vnd.google-apps.presentation';
const p = (o) => JSON.stringify(o);

export async function buildGoogleSlides(deckJson, { stylePath, gws = gwsCli(), fetch = globalThis.fetch, thumbnails = true } = {}) {
  const html = buildTalk(deckJson, { stylePath });
  const dir = dirname(resolve(deckJson));
  const deck = JSON.parse(readFileSync(deckJson, 'utf8'));
  const styleFile = stylePath ? resolve(stylePath) : findStyle(dir);
  const style = styleFile ? readStyle(readFileSync(styleFile, 'utf8')) : {};

  checkGws(gws);

  const local = [...new Set(deck.slides.filter((s) => (s.type ?? 'image') === 'image' && s.image).map((s) => s.image))];
  const wrong = local.filter((f) => !IMAGE_TYPES[extname(f).toLowerCase()]);
  if (wrong.length)
    throw new SlidesError(`Google Slides takes PNG, JPEG or GIF images, not ${wrong.join(', ')}. Save those as PNG, point deck.json at them and run this again.`);

  const folder = gws(['drive', 'files', 'create', '--json', p({ name: `${deck.title} (Google Slides)`, mimeType: FOLDER })]).id;
  const presentationId = gws(['drive', 'files', 'create', '--json', p({ name: deck.title, mimeType: PRESENTATION, parents: [folder] })]).id;
  const before = gws(['slides', 'presentations', 'get', '--params', p({ presentationId })]);

  // Google Slides fetches every image from an address, so each one goes to Drive first and is
  // readable by link only while the slides are built; the presentation keeps its own copy.
  const shared = [];
  const temp = mkdtempSync(join(tmpdir(), 'talk-builder-slides-'));
  const upload = (path, name, mime) => {
    const id = gws(['drive', 'files', 'create', '--json', p({ name, parents: [folder] }), '--upload', path, '--upload-content-type', mime]).id;
    const permission = gws(['drive', 'permissions', 'create', '--params', p({ fileId: id }), '--json', p({ role: 'reader', type: 'anyone' })]).id;
    shared.push({ fileId: id, permissionId: permission });
    return `https://drive.google.com/uc?export=download&id=${id}`;
  };

  let raised;
  try {
    const images = {};
    for (const f of local) images[f] = upload(join(dir, f), basename(f), IMAGE_TYPES[extname(f).toLowerCase()]);
    const qr = {};
    deck.slides.forEach((s, i) => {
      if (s.type !== 'qr' || qr[s.url]) return;
      const file = join(temp, `qr-${i + 1}.png`);
      writeFileSync(file, qrPng(s.url));
      qr[s.url] = upload(file, `qr-slide-${i + 1}.png`, 'image/png');
    });

    const built = slidesRequests(deck, style, { page: { width: before.pageSize.width.magnitude, height: before.pageSize.height.magnitude }, images, qr });
    raised = built.raised;
    // The new presentation's own first slide goes last, once the deck's slides exist.
    const requests = [...built.requests, ...(before.slides ?? []).map((page) => ({ deleteObject: { objectId: page.objectId } }))];
    gws(['slides', 'presentations', 'batchUpdate', '--params', p({ presentationId }), '--json', p({ requests })]);

    const after = gws(['slides', 'presentations', 'get', '--params', p({ presentationId })]);
    const notes = notesRequests(deck, after);
    if (notes.length) gws(['slides', 'presentations', 'batchUpdate', '--params', p({ presentationId }), '--json', p({ requests: notes })]);
  } finally {
    for (const s of shared) {
      try {
        gws(['drive', 'permissions', 'delete', '--params', p(s)]);
      } catch {
        // Revoking is tidying; a failure here must not hide the real error.
      }
    }
    rmSync(temp, { recursive: true, force: true });
  }

  const exported = [];
  if (thumbnails) {
    const out = join(dir, OUT_DIR);
    rmSync(out, { recursive: true, force: true });
    mkdirSync(out, { recursive: true });
    for (const [i] of deck.slides.entries()) {
      const thumb = gws([
        'slides', 'presentations', 'pages', 'getThumbnail',
        '--params', p({ presentationId, pageObjectId: slideId(i), 'thumbnailProperties.thumbnailSize': 'LARGE' }),
      ]);
      const response = await fetch(thumb.contentUrl);
      if (!response.ok) throw new SlidesError(`could not download the picture of slide ${i + 1} (${response.status})`);
      const file = join(out, `slide-${String(i + 1).padStart(2, '0')}.png`);
      writeFileSync(file, Buffer.from(await response.arrayBuffer()));
      exported.push(file);
    }
  }

  const url = `https://docs.google.com/presentation/d/${presentationId}/edit`;
  const record = { presentationId, url, folderId: folder, slides: deck.slides.length, raised, exported: exported.map((f) => relative(dir, f)) };
  writeFileSync(join(dir, RECORD_FILE), `${JSON.stringify(record, null, 2)}\n`);
  return { ...record, html: html.out, throughline: html.throughline };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const styleAt = args.indexOf('--style');
  const stylePath = styleAt === -1 ? undefined : args.splice(styleAt, 2)[1];
  if (args.length !== 1) {
    console.error('Usage: node google-slides.mjs <talk folder>/slides/deck.json [--style speaker-style.md]');
    process.exit(2);
  }
  const rel = (f) => relative(process.cwd(), f) || f;
  const deckDir = dirname(resolve(args[0]));
  try {
    const result = await buildGoogleSlides(args[0], { stylePath });
    console.log(`Built ${rel(result.html)} (the offline deck) and the Google Slides deck: ${result.url}`);
    for (const r of result.raised)
      console.log(`Slide ${r.slide}: panel opacity raised from ${r.from} to ${r.to}, so the sentence keeps 4.5:1 without the blur`);
    if (result.exported.length) console.log(`Every slide as a picture, to look at: ${rel(join(deckDir, OUT_DIR))}/`);
    console.log(`Throughline: ${result.throughline}`);
  } catch (e) {
    if (e instanceof SlidesUnavailable) {
      console.error(`Google Slides not built: ${e.message}`);
      console.error(`The HTML deck is built: ${rel(join(deckDir, 'index.html'))}. Check it with html-slides (check-deck.mjs) and present from it.`);
      console.error(`To use Google Slides next time, follow the setup in ${SETUP}, then run this again.`);
      process.exit(3);
    }
    if (!(e instanceof TalkError || e instanceof SlidesError)) throw e;
    console.error(`${e instanceof TalkError ? 'Deck not built' : 'Google Slides not built'}: ${e.message}`);
    process.exit(1);
  }
}
