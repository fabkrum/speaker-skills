#!/usr/bin/env node
// Builds a self-contained HTML deck from a deck.json, next to it:
//   node build-deck.mjs <folder>/deck.json [--style <speaker-style.md>]
// writes <folder>/index.html and <folder>/deck/ (layout, navigation, QR library).
// Image paths in deck.json are relative to its folder. An image slide without an image gets a
// placeholder, so a deck can be built from the storyboard before the pictures exist.
// The style file is found on its own when it is called speaker-style.md and sits in the deck's
// folder or one of its parents; --style names another one.

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve, basename, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ASSETS = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'deck');
const STYLE_FILE = 'speaker-style.md';
const TYPES = ['image', 'text', 'black', 'qr'];
const AI = ['photo', 'illustration'];
const PANELS = ['bottom-left', 'bottom', 'bottom-right', 'top-left', 'top', 'top-right'];

const SCHEMES = {
  dark: { background: '#101418', text: '#ffffff', accent: '#56b4e9', panel: '#0c0e12' },
  light: { background: '#f6f4ef', text: '#14171c', accent: '#0072b2', panel: '#f6f4ef' },
};

export class DeckError extends Error {}

const escape = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// The style file: Markdown with flat `key: value` frontmatter (see references/style-file.md).
export function readStyle(text) {
  const lines = text.split(/\r?\n/);
  const style = {};
  if (lines[0] !== '---') return style;
  for (let i = 1; i < lines.length && lines[i] !== '---'; i++) {
    const m = lines[i].match(/^([\w-]+):\s*(.*?)\s*$/);
    if (m) style[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return style;
}

export function findStyle(deckDir) {
  for (let dir = resolve(deckDir); ; dir = dirname(dir)) {
    if (existsSync(join(dir, STYLE_FILE))) return join(dir, STYLE_FILE);
    if (dirname(dir) === dir) return null;
  }
}

const HEX = /^#(?:[0-9a-f]{3}){1,2}$/i;
function triplet(hex) {
  const h = hex.length === 4 ? [...hex.slice(1)].map((c) => c + c).join('') : hex.slice(1);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(' ');
}

function styleBlock(style, fontFile) {
  const scheme = SCHEMES[style.scheme] ?? SCHEMES.dark;
  const colour = (key) => {
    const value = style[key] ?? scheme[key];
    if (!HEX.test(value)) throw new DeckError(`style file: ${key} must be a hex colour like #1a2b3c, not "${value}"`);
    return value;
  };
  const panel = style.panel ?? style.background ?? scheme.panel;
  if (!HEX.test(panel)) throw new DeckError(`style file: panel must be a hex colour like #1a2b3c, not "${panel}"`);
  const vars = [
    `--deck-bg: ${colour('background')};`,
    `--deck-text: ${colour('text')};`,
    `--deck-accent: ${colour('accent')};`,
    `--deck-panel: ${triplet(panel)};`,
  ];
  if (style.scheme === 'light') vars.push('--deck-dim: 0.74;');
  const css = (s) => s.replace(/[;{}<]/g, '');
  const font = style.font ? css(style.font) : fontFile ? 'system-ui, sans-serif' : null;
  if (font) vars.push(`--deck-font: ${fontFile ? `'Deck Font', ` : ''}${font};`);
  if (style['code-font']) vars.push(`--deck-code-font: ${css(style['code-font'])};`);
  const face = fontFile
    ? `@font-face { font-family: 'Deck Font'; src: url('deck/fonts/${encodeURI(fontFile)}'); font-display: block; }\n`
    : '';
  return `${face}:root { ${vars.join(' ')} }`;
}

function placeholderSvg(text, style) {
  const scheme = SCHEMES[style.scheme] ?? SCHEMES.dark;
  const a = HEX.test(style.background ?? '') ? style.background : scheme.background;
  const b = HEX.test(style.accent ?? '') ? style.accent : scheme.accent;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
  <rect width="1920" height="1080" fill="url(#g)"/>
  <text x="80" y="120" font-family="system-ui, sans-serif" font-size="40" fill="#ffffff" opacity="0.85">Image to come: ${escape(text)}</text>
</svg>
`;
}

function validate(deck) {
  if (!deck || !Array.isArray(deck.slides) || !deck.slides.length) throw new DeckError('deck.json needs a "slides" list');
  if (!deck.title) throw new DeckError('deck.json needs a "title"');
  deck.slides.forEach((s, i) => {
    const at = `slide ${i + 1}`;
    const type = s.type ?? 'image';
    if (!TYPES.includes(type)) throw new DeckError(`${at}: type "${type}" is not one of ${TYPES.join(', ')}`);
    if (type === 'image') {
      if (!s.sentence) throw new DeckError(`${at}: an image slide needs its one sentence`);
      if (!s.alt?.trim()) throw new DeckError(`${at}: the image needs alt text`);
      if (s.ai && !AI.includes(s.ai)) throw new DeckError(`${at}: ai is "photo" (photorealistic) or "illustration"`);
      if (s.panel && !PANELS.includes(s.panel)) throw new DeckError(`${at}: panel is one of ${PANELS.join(', ')}`);
      if (s.dim !== undefined && !(s.dim >= 0 && s.dim <= 1)) throw new DeckError(`${at}: dim is a number from 0 to 1`);
    }
    if (type === 'text') {
      if (!s.sentence) throw new DeckError(`${at}: a sentence-only slide needs its sentence`);
      if ([s.figure, s.code, s.compare].filter((x) => x !== undefined).length > 1)
        throw new DeckError(`${at}: a sentence-only slide shows one of figure, code or compare`);
      if (s.compare !== undefined && (!Array.isArray(s.compare) || s.compare.length < 2 || s.compare.length > 3))
        throw new DeckError(`${at}: compare is a list of two or three items`);
    }
    if (type === 'qr') {
      if (!s.sentence) throw new DeckError(`${at}: the QR slide needs its sentence`);
      if (!/^https?:\/\/\S+$/.test(s.url ?? '')) throw new DeckError(`${at}: the QR slide needs the guide's address as url`);
    }
  });
}

function slideHtml(s, n, style) {
  const type = s.type ?? 'image';
  const parts = [];
  if (type === 'image') {
    const panel = s.panel ?? 'bottom-left';
    const dim = s.dim !== undefined ? ` style="--deck-dim: ${s.dim}"` : '';
    parts.push(
      `<div class="slide__panel slide__panel--${panel}"${dim}><h2 class="slide__sentence">${escape(s.sentence)}</h2></div>`,
      `<img class="slide__image" src="${escape(s.image)}" alt="${escape(s.alt)}"${s.ai ? ` data-ai="${s.ai}"` : ''}>`,
    );
    if (s.ai === 'photo')
      parts.push(`<p class="ai-label${panel.startsWith('top') ? ' ai-label--bottom' : ''}">AI-generated</p>`);
  } else if (type === 'text') {
    parts.push(`<h2 class="slide__sentence">${escape(s.sentence)}</h2>`);
    if (s.figure !== undefined) parts.push(`<p class="slide__figure">${escape(s.figure)}</p>`);
    if (s.code !== undefined) parts.push(`<pre class="slide__code"><code>${escape(s.code)}</code></pre>`);
    if (s.compare) parts.push(`<ul class="slide__compare">${s.compare.map((c) => `<li>${escape(c)}</li>`).join('')}</ul>`);
  } else if (type === 'black') {
    parts.push(`<h2 class="visually-hidden">${escape(s.title ?? 'Pause')}</h2>`);
  } else if (type === 'qr') {
    const shown = s.url.replace(/^https?:\/\//, '').replace(/\/$/, '');
    parts.push(
      `<div><h2 class="slide__sentence">${escape(s.sentence)}</h2><p class="slide__url">${escape(shown)}</p></div>`,
      `<div class="slide__qr" data-qr="${escape(s.url)}" role="img" aria-label="QR code that opens ${escape(shown)}"></div>`,
    );
  }
  if (type !== 'black') parts.push(`<p class="slide__number">${n}</p>`);
  if (s.notes) parts.push(`<aside class="notes">${escape(s.notes)}</aside>`);
  return `<section class="slide slide--${type}" id="slide-${n}">\n  ${parts.join('\n  ')}\n</section>`;
}

export function renderDeck(deck, style = {}, { fontFile } = {}) {
  validate(deck);
  const slides = deck.slides.map((s, i) => slideHtml(s, i + 1, style)).join('\n');
  return `<!doctype html>
<html lang="${escape(deck.lang ?? 'en')}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(deck.title)}</title>
<link rel="stylesheet" href="deck/deck.css">
<style>
${styleBlock(style, fontFile)}
</style>
</head>
<body>
<main class="deck">
${slides}
</main>
<script src="deck/qrcode.js"></script>
<script src="deck/deck.js"></script>
</body>
</html>
`;
}

export function buildDeck(deckJson, { stylePath } = {}) {
  const dir = dirname(resolve(deckJson));
  let deck;
  try {
    deck = JSON.parse(readFileSync(deckJson, 'utf8'));
  } catch (e) {
    throw new DeckError(`could not read ${deckJson}: ${e.message}`);
  }
  const styleFile = stylePath ? resolve(stylePath) : findStyle(dir);
  const style = styleFile ? readStyle(readFileSync(styleFile, 'utf8')) : {};

  mkdirSync(join(dir, 'deck'), { recursive: true });
  for (const f of ['deck.css', 'deck.js', 'qrcode.js']) copyFileSync(join(ASSETS, f), join(dir, 'deck', f));

  let fontFile;
  if (style['font-file']) {
    const src = resolve(dirname(styleFile), style['font-file']);
    if (!existsSync(src)) throw new DeckError(`style file: font-file ${style['font-file']} does not exist`);
    fontFile = basename(src);
    mkdirSync(join(dir, 'deck', 'fonts'), { recursive: true });
    copyFileSync(src, join(dir, 'deck', 'fonts', fontFile));
  }

  (deck.slides ?? []).forEach((s, i) => {
    if ((s.type ?? 'image') !== 'image' || s.image) return;
    const name = `images/placeholder-${String(i + 1).padStart(2, '0')}.svg`;
    mkdirSync(join(dir, 'images'), { recursive: true });
    writeFileSync(join(dir, name), placeholderSvg(s.placeholder ?? s.alt ?? s.sentence ?? '', style));
    s.image = name;
  });
  for (const [i, s] of (deck.slides ?? []).entries())
    if (s.image && !/^data:/.test(s.image) && !existsSync(join(dir, s.image)))
      throw new DeckError(`slide ${i + 1}: image ${s.image} not found next to deck.json`);

  const out = join(dir, 'index.html');
  writeFileSync(out, renderDeck(deck, style, { fontFile }));
  return { out, styleFile, slides: deck.slides.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const styleAt = args.indexOf('--style');
  const stylePath = styleAt === -1 ? undefined : args.splice(styleAt, 2)[1];
  if (args.length !== 1) {
    console.error('Usage: node build-deck.mjs <folder>/deck.json [--style speaker-style.md]');
    process.exit(2);
  }
  try {
    const { out, styleFile, slides } = buildDeck(args[0], { stylePath });
    console.log(`Built ${relative(process.cwd(), out) || out}: ${slides} slides, style: ${styleFile ? relative(process.cwd(), styleFile) : 'none (default dark scheme)'}`);
  } catch (e) {
    if (!(e instanceof DeckError)) throw e;
    console.error(`Deck not built: ${e.message}`);
    process.exit(1);
  }
}
