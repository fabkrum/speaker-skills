#!/usr/bin/env node
// Builds the companion guide as one self-contained HTML file from a guide.json, next to it:
//   node build-guide.mjs <folder>/guide.json [--style <speaker-style.md>]
// writes <folder>/index.html. Images and the style file's font are inlined, so the one file is
// all there is to publish.
//
// guide.json names the concept of every storyboard slide, in order, and the one next step. With
// "deck" pointing to the talk's html-slides deck.json, each section takes its slide's sentence,
// image, alt text and AI marking from the deck, and the guide must have exactly one section per
// slide. Without a deck, each section carries its own.
// The style file is found on its own when it is called speaker-style.md and sits in the guide's
// folder or one of its parents; --style names another one.

import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, resolve, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findStyle, readStyle, SCHEMES } from '../../html-slides/scripts/build-deck.mjs';

const AI = ['photo', 'illustration'];
const DECK_KEYS = ['sentence', 'image', 'alt', 'ai'];
const MIME = { '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif' };
const FONT_MIME = { '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf' };
export const LARGE_BYTES = 5 * 1024 * 1024;

export class GuideError extends Error {}

const escape = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Text with `code` and [links](https://...), everything else escaped.
export function inline(text) {
  return escape(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');
}

const paragraphs = (body) => (Array.isArray(body) ? body : [body]).filter((p) => typeof p === 'string' && p.trim());
const isUrl = (u) => /^https?:\/\/\S+$/.test(u ?? '');

function dataUri(file, types, what) {
  const type = types[extname(file).toLowerCase()];
  if (!type) throw new GuideError(`${what} ${file}: use one of ${Object.keys(types).join(', ')}`);
  if (!existsSync(file)) throw new GuideError(`${what} ${file} not found`);
  return `data:${type};base64,${readFileSync(file).toString('base64')}`;
}

// The sections as the guide shows them: the guide's text merged with the slide it explains.
function sectionsOf(guide, dir) {
  if (!guide || !Array.isArray(guide.sections) || !guide.sections.length) throw new GuideError('guide.json needs a "sections" list, one per storyboard slide');
  if (!guide.title) throw new GuideError('guide.json needs the talk\'s "title"');
  let slides = null;
  let deckDir = null;
  if (guide.deck) {
    const deckJson = resolve(dir, guide.deck);
    try {
      slides = JSON.parse(readFileSync(deckJson, 'utf8')).slides;
    } catch (e) {
      throw new GuideError(`could not read the deck ${guide.deck}: ${e.message}`);
    }
    if (!Array.isArray(slides)) throw new GuideError(`the deck ${guide.deck} has no "slides" list`);
    if (slides.length !== guide.sections.length)
      throw new GuideError(`the deck has ${slides.length} slides and the guide ${guide.sections.length} sections; write exactly one section per slide, in order`);
    deckDir = dirname(deckJson);
  }
  return guide.sections.map((s, i) => {
    const at = `section ${i + 1}`;
    if (!s.concept?.trim()) throw new GuideError(`${at}: name the slide's concept ("concept")`);
    if (!paragraphs(s.body).length) throw new GuideError(`${at}: explain the concept ("body", one or more paragraphs)`);
    let shown;
    if (slides) {
      const own = DECK_KEYS.filter((k) => s[k] !== undefined);
      if (own.length) throw new GuideError(`${at}: ${own.join(', ')} come from the deck; change the deck, not the guide`);
      const slide = slides[i];
      shown = {
        type: slide.type ?? 'image',
        sentence: slide.sentence ?? slide.title,
        image: slide.image && !/^data:/.test(slide.image) ? join(deckDir, slide.image) : slide.image,
        alt: slide.alt,
        ai: slide.ai,
        figure: slide.figure,
        code: slide.code,
        compare: slide.compare,
        url: slide.url,
      };
    } else {
      shown = { type: s.image ? 'image' : 'text', sentence: s.sentence, image: s.image && join(dir, s.image), alt: s.alt, ai: s.ai };
    }
    if (shown.image && !shown.alt?.trim()) throw new GuideError(`${at}: the slide's image needs alt text`);
    if (shown.ai && !AI.includes(shown.ai)) throw new GuideError(`${at}: ai is "photo" (photorealistic) or "illustration"`);
    const aiTool = s.aiTool ?? guide.aiTool;
    if (shown.ai && !aiTool?.trim())
      throw new GuideError(`${at}: the slide's image is AI-generated; name the tool that made it ("aiTool" here, or once for the whole guide) so the colophon can list it`);
    return { ...shown, n: i + 1, concept: s.concept.trim(), body: paragraphs(s.body), aiTool: shown.ai ? aiTool.trim() : undefined };
  });
}

function validate(guide) {
  const next = guide.nextStep;
  if (!next || typeof next !== 'object') throw new GuideError('guide.json needs "nextStep": the one action for this week and how to do it');
  if (typeof next.action !== 'string' || !next.action.trim())
    throw new GuideError('nextStep.action is one action people can take this week, as one sentence (not a list)');
  if (!Array.isArray(next.how) || !next.how.length || next.how.some((h) => typeof h !== 'string' || !h.trim()))
    throw new GuideError('nextStep.how is a list of the steps that get the action done');
  const reading = guide.furtherReading;
  if (!Array.isArray(reading) || !reading.length) throw new GuideError('guide.json needs "furtherReading": at least one source for those who want more');
  reading.forEach((r, i) => {
    if (!r?.title?.trim() || !isUrl(r.url)) throw new GuideError(`furtherReading ${i + 1}: needs a "title" and a web address as "url"`);
  });
  if (guide.url !== undefined && !isUrl(guide.url)) throw new GuideError('url, the guide\'s own address, is a web address');
}

function styleBlock(style, fontUri) {
  const scheme = SCHEMES[style.scheme] ?? SCHEMES.dark;
  const HEX = /^#(?:[0-9a-f]{3}){1,2}$/i;
  const colour = (key) => {
    const value = style[key] ?? scheme[key];
    if (!HEX.test(value)) throw new GuideError(`style file: ${key} must be a hex colour like #1a2b3c, not "${value}"`);
    return value;
  };
  const css = (s) => s.replace(/[;{}<]/g, '');
  const vars = [`--guide-bg: ${colour('background')};`, `--guide-text: ${colour('text')};`, `--guide-accent: ${colour('accent')};`];
  const font = style.font ? css(style.font) : fontUri ? 'system-ui, sans-serif' : null;
  if (font) vars.push(`--guide-font: ${fontUri ? `'Guide Font', ` : ''}${font};`);
  if (style['code-font']) vars.push(`--guide-code-font: ${css(style['code-font'])};`);
  const face = fontUri ? `@font-face { font-family: 'Guide Font'; src: url('${fontUri}'); font-display: swap; }\n` : '';
  return `${face}:root { ${vars.join(' ')} }`;
}

const CSS = `
:root {
  --guide-bg: #101418;
  --guide-text: #ffffff;
  --guide-accent: #56b4e9;
  --guide-font: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  --guide-code-font: ui-monospace, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
}
*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  background: var(--guide-bg);
  color: var(--guide-text);
  font-family: var(--guide-font);
  font-size: 1.125rem;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.guide { max-width: 42rem; margin: 0 auto; padding: 2.5rem 1.25rem 4rem; }
h1, h2, h3 { line-height: 1.25; overflow-wrap: break-word; }
h1 { font-size: 2.25rem; margin: 0.25rem 0 0.75rem; }
h2 { font-size: 1.6rem; margin: 0 0 0.75rem; }
h3 { font-size: 1.2rem; margin: 1.5rem 0 0.5rem; }
a { color: var(--guide-accent); text-underline-offset: 0.15em; }
a:focus-visible { outline: 3px solid var(--guide-accent); outline-offset: 2px; }
code, pre { font-family: var(--guide-code-font); font-size: 0.95em; }
pre { white-space: pre-wrap; overflow-wrap: anywhere; padding: 0.75rem 1rem; border-left: 4px solid var(--guide-accent); margin: 1rem 0; }
.guide-kicker, .guide-slide__number { font-size: 1rem; letter-spacing: 0.04em; text-transform: uppercase; color: var(--guide-accent); margin: 0; font-weight: 600; }
.guide-meta { margin: 0 0 1rem; }
.guide-toc ol { padding-left: 1.5rem; }
.next-step { border: 3px solid var(--guide-accent); border-radius: 8px; padding: 1.25rem; margin-top: 2.5rem; }
.guide-slide, .further-reading { border-top: 1px solid color-mix(in srgb, var(--guide-text) 25%, transparent); padding-top: 2rem; margin-top: 2.5rem; }
.guide-slide__figure { position: relative; margin: 1rem 0; }
.guide-slide__figure img { display: block; width: 100%; height: auto; border-radius: 6px; }
.guide-slide__sentence { font-size: 1.25rem; font-weight: 600; border-left: 4px solid var(--guide-accent); padding-left: 1rem; margin: 1rem 0; }
.guide-slide__big { font-size: 3rem; font-weight: 700; color: var(--guide-accent); margin: 0.5rem 0; }
.ai-label { position: absolute; top: 0.5rem; right: 0.5rem; margin: 0; padding: 0.15rem 0.5rem; font-size: 1rem; background: #000000; color: #ffffff; border-radius: 4px; }
.next-step__action { font-size: 1.35rem; font-weight: 700; margin: 0 0 1rem; }
.colophon { border-top: 1px solid color-mix(in srgb, var(--guide-text) 25%, transparent); margin-top: 3rem; padding-top: 1.5rem; font-size: 1rem; }
.colophon h2 { font-size: 1.25rem; }
@media (max-width: 30rem) { h1 { font-size: 1.85rem; } .guide { padding-top: 1.5rem; } }
`;

function sectionHtml(s, images) {
  const parts = [`<p class="guide-slide__number">Slide ${s.n}</p>`, `<h2 id="slide-${s.n}-title">${escape(s.concept)}</h2>`];
  if (s.image) {
    const label = s.ai === 'photo' ? '\n    <p class="ai-label">AI-generated</p>' : '';
    parts.push(`<figure class="guide-slide__figure">\n    <img src="${images(s.image, s.n)}" alt="${escape(s.alt)}"${s.ai ? ` data-ai="${s.ai}"` : ''}>${label}\n  </figure>`);
  }
  if (s.sentence) parts.push(`<p class="guide-slide__sentence">${escape(s.sentence)}</p>`);
  if (s.figure !== undefined) parts.push(`<p class="guide-slide__big">${escape(s.figure)}</p>`);
  if (s.code !== undefined) parts.push(`<pre><code>${escape(s.code)}</code></pre>`);
  if (s.compare) parts.push(`<ul>${s.compare.map((c) => `<li>${escape(c)}</li>`).join('')}</ul>`);
  for (const p of s.body) parts.push(`<p>${inline(p)}</p>`);
  return `<section class="guide-slide" id="slide-${s.n}" data-slide="${s.n}" aria-labelledby="slide-${s.n}-title">\n  ${parts.join('\n  ')}\n</section>`;
}

function colophonHtml(sections) {
  const ai = sections.filter((s) => s.ai);
  const list = ai.length
    ? `<p>These images were made with AI:</p>\n<ul>\n${ai
        .map((s) => `  <li data-slide="${s.n}">Slide ${s.n}, ${escape(s.alt ?? s.concept)}: ${s.ai === 'photo' ? 'a photorealistic image' : 'an illustration'} made with ${escape(s.aiTool)}${s.image ? '' : ' (image to come)'}.</li>`)
        .join('\n')}\n</ul>`
    : '<p>No image in this guide or its talk was made with AI.</p>';
  return `<footer class="colophon" id="colophon" aria-labelledby="colophon-title">\n<h2 id="colophon-title">Colophon</h2>\n${list}\n</footer>`;
}

export function renderGuide(guide, sections, style = {}, { images = (src) => src, fontUri } = {}) {
  validate(guide);
  const next = guide.nextStep;
  const meta = [guide.speaker, guide.event].filter(Boolean).map(escape).join(' · ');
  const toc = sections.map((s) => `<li><a href="#slide-${s.n}">${escape(s.concept)}</a></li>`).join('');
  const why = next.why ? `\n<p>${inline(next.why)}</p>` : '';
  return `<!doctype html>
<html lang="${escape(guide.lang ?? 'en')}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(guide.title)}: the guide</title>
<style>${CSS}
${styleBlock(style, fontUri)}
</style>
</head>
<body>
<div class="guide">
<header>
<p class="guide-kicker">The guide to the talk</p>
<h1>${escape(guide.title)}</h1>
${meta ? `<p class="guide-meta">${meta}</p>\n` : ''}${guide.intro ? `<p>${inline(guide.intro)}</p>\n` : ''}<nav class="guide-toc" aria-label="Contents"><ol>${toc}<li><a href="#next-step">Your next step</a></li></ol></nav>
</header>
<main>
${sections.map((s) => sectionHtml(s, images)).join('\n')}
<section class="next-step" id="next-step" aria-labelledby="next-step-title">
<h2 id="next-step-title">Your next step</h2>
<p class="next-step__action">${inline(next.action)}</p>${why}
<h3>How to do it</h3>
<ol>
${next.how.map((h) => `  <li>${inline(h)}</li>`).join('\n')}
</ol>
</section>
<section class="further-reading" id="further-reading" aria-labelledby="further-reading-title">
<h2 id="further-reading-title">Further reading</h2>
<ul>
${guide.furtherReading.map((r) => `  <li><a href="${escape(r.url)}">${escape(r.title)}</a>${r.note ? `: ${inline(r.note)}` : ''}</li>`).join('\n')}
</ul>
</section>
</main>
${colophonHtml(sections)}
</div>
</body>
</html>
`;
}

export function buildGuide(guideJson, { stylePath } = {}) {
  const dir = dirname(resolve(guideJson));
  let guide;
  try {
    guide = JSON.parse(readFileSync(guideJson, 'utf8'));
  } catch (e) {
    throw new GuideError(`could not read ${guideJson}: ${e.message}`);
  }
  const sections = sectionsOf(guide, dir);
  const styleFile = stylePath ? resolve(stylePath) : findStyle(dir);
  const style = styleFile ? readStyle(readFileSync(styleFile, 'utf8')) : {};
  const fontUri = style['font-file'] ? dataUri(resolve(dirname(styleFile), style['font-file']), FONT_MIME, 'style file: font-file') : undefined;
  const images = (src, n) => (/^data:/.test(src) ? src : dataUri(src, MIME, `slide ${n}: image`));

  const out = join(dir, 'index.html');
  writeFileSync(out, renderGuide(guide, sections, style, { images, fontUri }));
  const bytes = statSync(out).size;
  // The deck's QR slide should open this guide.
  const bare = (u) => u.replace(/\/+$/, '');
  const qr = sections.find((s) => s.type === 'qr' && s.url);
  const qrElsewhere = guide.url && qr && bare(qr.url) !== bare(guide.url) ? qr.url : null;
  return { out, styleFile, sections: sections.length, aiImages: sections.filter((s) => s.ai).length, bytes, large: bytes > LARGE_BYTES, qrElsewhere };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const styleAt = args.indexOf('--style');
  const stylePath = styleAt === -1 ? undefined : args.splice(styleAt, 2)[1];
  if (args.length !== 1) {
    console.error('Usage: node build-guide.mjs <folder>/guide.json [--style speaker-style.md]');
    process.exit(2);
  }
  try {
    const { out, styleFile, sections, aiImages, bytes, large, qrElsewhere } = buildGuide(args[0], { stylePath });
    const mb = (bytes / 1024 / 1024).toFixed(1);
    console.log(`Built ${relative(process.cwd(), out) || out}: ${sections} sections, ${aiImages} AI image(s) in the colophon, ${mb} MB, style: ${styleFile ? relative(process.cwd(), styleFile) : 'none (default dark scheme)'}`);
    if (qrElsewhere) console.log(`The deck's QR slide opens ${qrElsewhere}, not this guide's address ${JSON.parse(readFileSync(args[0], 'utf8')).url}: change one of them and build again.`);
    if (large) console.log(`The file is ${mb} MB, slow on a phone: save the images about 1280 px wide as JPEG or WebP and build again.`);
  } catch (e) {
    if (!(e instanceof GuideError)) throw e;
    console.error(`Guide not built: ${e.message}`);
    process.exit(1);
  }
}
