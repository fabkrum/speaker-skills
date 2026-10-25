#!/usr/bin/env node
// The guide's artefact check, in a real browser:
//   node check-guide.mjs <guide folder or index.html> [--deck <deck.json> | --storyboard <storyboard.md>] [--json]
// Without --deck or --storyboard it uses the deck named in the guide.json next to index.html.
// Exit 0 when the guide passes, 1 when it fails, 2 when the check could not run (no browser,
// nothing to compare the sections with). Writes guide-check.json next to index.html; eval
// graders read that file.
//
// It fails a guide when
//   - it does not have exactly one section per storyboard slide, numbered and in the slides'
//     order (with a deck, each section also shows its slide's sentence),
//   - there is no "Your next step" block with exactly one action, or "Further reading" does not
//     come after it,
//   - the colophon misses an AI-generated image (from the guide or from the deck),
//   - a photorealistic AI image has no visible "AI-generated" label,
//   - an image has no alt text or does not load,
//   - anything sticks out sideways at 390 px wide (horizontal scroll), or body text is smaller
//     than 16 px there,
//   - text reaches less than 4.5:1 against its background,
//   - the page loads anything from the network (it is one self-contained file).

import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { launch, openPage, BrowserNotFound } from '../../html-slides/scripts/browser.mjs';

export const MIN_CONTRAST = 4.5;
export const MIN_BODY_PX = 16;
const PHONE = { width: 390, height: 844 };

// Thrown when there is nothing to compare the sections with: the check could not run.
export class NoStoryboard extends Error {}

// The slides the guide must follow: from a deck.json, a storyboard.md (its numbered lines), or
// the deck named in the guide.json next to the guide.
export function readSlides({ deck, storyboard, guideDir }) {
  if (!deck && !storyboard) {
    const guideJson = join(guideDir, 'guide.json');
    const named = existsSync(guideJson) && JSON.parse(readFileSync(guideJson, 'utf8')).deck;
    if (!named) throw new NoStoryboard('nothing to compare the sections with: pass --deck <deck.json> or --storyboard <storyboard.md>');
    deck = resolve(guideDir, named);
  }
  if (deck) {
    const { slides } = JSON.parse(readFileSync(deck, 'utf8'));
    return slides.map((s) => ({ sentence: s.sentence ?? s.title ?? null, ai: s.ai ?? null }));
  }
  const lines = readFileSync(storyboard, 'utf8').split(/\r?\n/).filter((l) => /^ {0,3}\d+[.)]\s+\S/.test(l));
  if (!lines.length) throw new NoStoryboard(`${storyboard} has no numbered slides (lines like "1. The hook")`);
  return lines.map(() => ({ sentence: null, ai: null }));
}

// Runs inside the page.
const INSPECT = String.raw`(async () => {
  await document.fonts.ready;
  await Promise.all([...document.images].map((i) => (i.complete ? 0 : new Promise((r) => (i.onload = i.onerror = r)))));
  const w = innerWidth;
  const describe = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '');
  const shown = (el) => {
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.1) return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const heading = (re) => [...document.querySelectorAll('h2')].find((h) => re.test(h.textContent.trim()));
  const block = (h) => h && (h.closest('section, footer, aside, div') ?? h);
  const before = (a, b) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

  const sections = [...document.querySelectorAll('.guide-slide')].map((s) => ({
    slide: Number(s.dataset.slide),
    title: (s.querySelector('h2')?.textContent ?? '').trim(),
    sentence: (s.querySelector('.guide-slide__sentence')?.textContent ?? '').trim() || null,
    text: s.querySelectorAll('p, li').length,
  }));
  const next = block(heading(/^your next step$/i));
  const reading = block(heading(/^further reading$/i));
  const colophon = block(heading(/^colophon$/i));
  const lastSection = [...document.querySelectorAll('.guide-slide')].at(-1);

  const images = [...document.images].map((img) => {
    const section = img.closest('.guide-slide');
    const label = [...(img.closest('figure, .guide-slide') ?? img.parentElement).querySelectorAll('*')]
      .find((e) => /^AI-generated\b.{0,24}$/is.test(e.textContent.trim()) && shown(e));
    return {
      src: (img.getAttribute('src') ?? '').slice(0, 60),
      alt: img.getAttribute('alt'),
      loaded: img.complete && img.naturalWidth > 0,
      ai: img.dataset.ai || null,
      slide: section ? Number(section.dataset.slide) : null,
      labelled: !!label,
    };
  });

  const sideways = [];
  if (document.documentElement.scrollWidth > w) sideways.push('the page is ' + document.documentElement.scrollWidth + ' px wide');
  for (const e of document.body.querySelectorAll('*')) {
    if (!shown(e)) continue;
    const r = e.getBoundingClientRect();
    if (r.width > 1 && r.height > 1 && (r.right > w + 0.5 || r.left < -0.5)) sideways.push(describe(e) + ' spans ' + Math.round(r.left) + ' to ' + Math.round(r.right) + ' px');
  }

  const small = [...document.querySelectorAll('main p, main li')]
    .filter((e) => shown(e) && e.textContent.trim() && !e.classList.contains('ai-label'))
    .map((e) => ({ element: describe(e), text: e.textContent.trim().slice(0, 40), size: parseFloat(getComputedStyle(e).fontSize) }));

  // Text colour against the first solid background behind it.
  const rgba = (c) => (c.match(/[\d.]+/g) ?? []).map(Number);
  const background = (e) => {
    for (let x = e; x; x = x.parentElement) {
      const c = rgba(getComputedStyle(x).backgroundColor);
      if (c.length === 3 || (c.length === 4 && c[3] >= 0.99)) return c.slice(0, 3);
    }
    return [255, 255, 255];
  };
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const contrast = [...document.body.querySelectorAll('h1, h2, h3, p, li, a, code, figcaption')]
    .filter((e) => shown(e) && e.textContent.trim())
    .map((e) => ({ element: describe(e), text: e.textContent.trim().slice(0, 40), ratio: Math.floor(ratio(rgba(getComputedStyle(e).color).slice(0, 3), background(e)) * 100) / 100 }));

  return {
    sections,
    next: next ? { actions: [...next.querySelectorAll('.next-step__action')].filter((e) => e.textContent.trim()).length, afterSections: !lastSection || before(lastSection, next) } : null,
    reading: reading ? { afterNext: !!next && before(next, reading) } : null,
    colophon: colophon ? { slides: [...colophon.querySelectorAll('[data-slide]')].map((e) => Number(e.dataset.slide)), text: colophon.textContent } : null,
    images, sideways, small, contrast,
  };
})()`;

const local = (url) => /^(file|data|blob|about):/.test(url);

export async function checkGuide(target, { deck, storyboard, browser } = {}) {
  const html = statSync(target).isDirectory() ? join(target, 'index.html') : target;
  if (!existsSync(html)) throw new Error(`${html} does not exist`);
  const slides = readSlides({ deck, storyboard, guideDir: dirname(resolve(html)) });
  const own = !browser;
  browser ??= await launch();
  const problems = [];
  const add = (slide, check, message) => problems.push({ slide, check, message });
  let info;
  let requests = [];
  try {
    const page = await openPage(browser, PHONE);
    await page.goto(pathToFileURL(resolve(html)).href);
    info = await page.evaluate(INSPECT);
    requests = page.requests;
  } finally {
    if (own) await browser.close();
  }

  // One section per storyboard slide, in order.
  const { sections } = info;
  if (sections.length !== slides.length)
    add(null, 'sections', `the guide has ${sections.length} slide sections and the storyboard ${slides.length} slides; it needs exactly one per slide`);
  sections.forEach((s, i) => {
    if (s.slide !== i + 1) add(i + 1, 'sections', `section ${i + 1} is marked as slide ${s.slide || '?'}: the sections must follow the slides in order`);
    if (!s.title) add(i + 1, 'sections', `section ${i + 1} does not name its concept in a heading`);
    if (!s.text) add(i + 1, 'sections', `section ${i + 1} does not explain its concept`);
    const expected = slides[i]?.sentence;
    if (expected && s.sentence && s.sentence !== expected.trim())
      add(i + 1, 'sections', `section ${i + 1} shows "${s.sentence.slice(0, 50)}", but slide ${i + 1} says "${expected.slice(0, 50)}": out of order`);
  });

  // The next step, then further reading.
  if (!info.next) add(null, 'next-step', 'there is no "Your next step" block');
  else {
    if (info.next.actions !== 1) add(null, 'next-step', `the "Your next step" block has ${info.next.actions} actions; it needs exactly one`);
    if (!info.next.afterSections) add(null, 'next-step', 'the "Your next step" block comes before the slide sections; it closes them');
  }
  if (!info.reading) add(null, 'further-reading', 'there is no "Further reading" block');
  else if (!info.reading.afterNext) add(null, 'further-reading', '"Further reading" must come after "Your next step"');

  // Images: alt text, loading, the AI label, the colophon.
  const listed = new Set(info.colophon?.slides ?? []);
  const aiSlides = new Set();
  for (const img of info.images) {
    if (!img.alt?.trim()) add(img.slide, 'alt', `image ${img.src} has no alt text`);
    if (!img.loaded) add(img.slide, 'image', `image ${img.src} did not load`);
    if (img.ai === 'photo' && !img.labelled) add(img.slide, 'ai-label', 'a photorealistic AI image has no visible "AI-generated" label');
    if (img.ai) aiSlides.add(img.slide);
  }
  slides.forEach((s, i) => s.ai && aiSlides.add(i + 1));
  if (!info.colophon) add(null, 'colophon', 'there is no colophon');
  for (const n of [...aiSlides].sort((a, b) => a - b))
    if (!listed.has(n)) add(n, 'colophon', `the AI-generated image of slide ${n} is missing from the colophon`);

  // The phone.
  for (const what of info.sideways) add(null, 'phone', `at ${PHONE.width} px wide, ${what}: horizontal scroll`);
  for (const t of info.small.filter((t) => t.size < MIN_BODY_PX))
    add(null, 'text-size', `"${t.text}" is ${t.size} px at ${PHONE.width} px wide; body text needs at least ${MIN_BODY_PX} px`);
  for (const t of info.contrast.filter((t) => t.ratio < MIN_CONTRAST))
    add(null, 'contrast', `"${t.text}" (${t.element}) reaches ${t.ratio}:1 against its background; it needs ${MIN_CONTRAST}:1`);

  for (const url of new Set(requests.filter((u) => !local(u))))
    add(null, 'offline', `loads ${url} from the network; the guide must be one self-contained file`);

  const lowest = info.contrast.length ? Math.min(...info.contrast.map((c) => c.ratio)) : null;
  return {
    guide: html,
    passed: problems.length === 0,
    slides: slides.length,
    sections: sections.length,
    aiImages: aiSlides.size,
    lowestContrast: lowest,
    problems,
  };
}

export function formatReport(report) {
  const lines = report.problems.map((p) => `${p.slide ? `slide ${p.slide}` : 'guide'} [${p.check}]: ${p.message}`);
  const summary = `${report.sections} sections for ${report.slides} slides, ${report.aiImages} AI image(s)`;
  lines.push(report.passed ? `Guide check passed: ${summary}.` : `Guide check failed: ${report.problems.length} problem(s), ${summary}.`);
  return lines.join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const option = (name) => {
    const at = args.indexOf(name);
    return at === -1 ? undefined : args.splice(at, 2)[1];
  };
  const json = args.includes('--json');
  const deck = option('--deck');
  const storyboard = option('--storyboard');
  const [target] = args.filter((a) => a !== '--json');
  if (!target) {
    console.error('Usage: node check-guide.mjs <guide folder or index.html> [--deck deck.json | --storyboard storyboard.md] [--json]');
    process.exit(2);
  }
  try {
    const report = await checkGuide(target, { deck, storyboard });
    const html = report.guide;
    writeFileSync(join(dirname(html), 'guide-check.json'), JSON.stringify({ ...report, guide: relative(dirname(html), html) }, null, 2) + '\n');
    console.log(json ? JSON.stringify(report, null, 2) : formatReport(report));
    process.exit(report.passed ? 0 : 1);
  } catch (e) {
    if (e instanceof BrowserNotFound || e instanceof NoStoryboard) {
      console.error(`Guide check could not run: ${e.message}`);
      process.exit(2);
    }
    throw e;
  }
}
