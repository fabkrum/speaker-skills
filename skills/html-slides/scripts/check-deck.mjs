#!/usr/bin/env node
// The deck's artefact check, in a real browser:
//   node check-deck.mjs <deck folder or index.html> [--json]
// Exit 0 when the deck passes, 1 when it fails, 2 when the check could not run (no browser).
// Writes deck-check.json next to index.html; eval graders read that file.
//
// It fails a deck when
//   - a slide's text reaches less than 4.5:1 against the pixels behind it, measured on a
//     screenshot of the rendered slide with the text hidden (so a blurred panel over a photo is
//     measured as the room sees it, at its worst spot),
//   - an image marked as a photorealistic AI image (data-ai="photo") has no visible, readable
//     "AI-generated" label on its slide,
//   - an image has no alt text, does not load, or a slide draws an image with CSS (no alt text),
//   - anything sticks out sideways at 390 px wide (horizontal scroll),
//   - the deck loads anything from the network (it must run offline),
//   - a QR slide has no QR code.

import { existsSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { launch, openPage, BrowserNotFound } from './browser.mjs';

export const MIN_CONTRAST = 4.5;
const MIN_LABEL_PX = 16; // at a 1280 px wide slide, i.e. 24 px on a 1920 px slide
const DESKTOP = { width: 1280, height: 720 };
const PHONE = { width: 390, height: 844 };
const TEXT = '.slide__sentence, .slide__figure, .slide__code, .slide__compare li, .slide__url, .ai-label';

// Runs inside the page: helpers the check calls through page.evaluate.
const PAGE_HELPERS = String.raw`
window.__check = (() => {
  const LABEL = /^AI-generated\b.{0,24}$/is;
  const slides = () => [...document.querySelectorAll('.deck > .slide')];
  const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const describe = (el) => el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '');

  function shown(el) {
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || parseFloat(cs.opacity) < 0.1) return false;
    }
    return getComputedStyle(el).visibility === 'visible';
  }
  function textRect(el) {
    const range = document.createRange();
    range.selectNodeContents(el);
    const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
    if (!rects.length) return null;
    const x = Math.min(...rects.map((r) => r.left)), y = Math.min(...rects.map((r) => r.top));
    const right = Math.max(...rects.map((r) => r.right)), bottom = Math.max(...rects.map((r) => r.bottom));
    // Keep inside the slide and the window.
    const s = el.closest('.slide').getBoundingClientRect();
    const l = Math.max(x, s.left, 0), t = Math.max(y, s.top, 0);
    const r = Math.min(right, s.right, innerWidth), b = Math.min(bottom, s.bottom, innerHeight);
    if (r - l < 1 || b - t < 1) return null;
    return { x: Math.ceil(l), y: Math.ceil(t), width: Math.floor(r) - Math.ceil(l), height: Math.floor(b) - Math.ceil(t) };
  }
  function onTop(el, rect) {
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return !!hit && (hit === el || el.contains(hit));
  }

  return {
    async prepare() {
      await document.fonts.ready;
      await Promise.all([...document.images].map((i) => (i.complete ? 0 : new Promise((r) => (i.onload = i.onerror = r)))));
      const style = document.createElement('style');
      style.textContent = '*, *::before, *::after { transition: none !important; animation: none !important; }'
        + ' .__check-hide, .__check-hide * { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; }';
      document.head.append(style);
      return { deck: typeof window.deck === 'object', count: slides().length };
    },
    async show(i) {
      window.deck.black(false);
      window.deck.go(i);
      await frames();
      return window.deck.index === i;
    },
    inspect(i) {
      const slide = slides()[i];
      const images = [...slide.querySelectorAll('img')].map((img) => ({
        src: img.getAttribute('src'),
        alt: img.getAttribute('alt'),
        ai: img.dataset.ai || null,
        loaded: img.complete && img.naturalWidth > 0,
      }));
      const cssImages = [slide, ...slide.querySelectorAll('*')]
        .filter((e) => /url\(/.test(getComputedStyle(e).backgroundImage))
        .map(describe);
      const labels = [...slide.querySelectorAll('*')]
        // A label is a short text that starts with the words, not a sentence that mentions them.
        .filter((e) => !e.closest('.slide__sentence, h1, h2, h3') && LABEL.test(e.textContent.trim()) && ![...e.children].some((c) => LABEL.test(c.textContent.trim())))
        .map((e) => {
          const rect = textRect(e);
          return {
            element: describe(e),
            visible: !!rect && shown(e) && onTop(e, rect),
            fontSize: parseFloat(getComputedStyle(e).fontSize),
          };
        });
      const texts = [...slide.querySelectorAll(${JSON.stringify(TEXT)})]
        .map((e, n) => {
          e.dataset.checkId = String(n);
          const rect = textRect(e);
          return rect && shown(e) ? { id: n, element: describe(e), text: e.textContent.trim().slice(0, 60), color: getComputedStyle(e).color, rect } : null;
        })
        .filter(Boolean);
      const qr = [...slide.querySelectorAll('.slide__qr')].map((e) => {
        const svg = e.querySelector('svg, img, canvas');
        const r = svg && svg.getBoundingClientRect();
        return { url: e.dataset.qr || '', drawn: !!r && r.width > 20 && r.height > 20 };
      });
      return { images, cssImages, labels, texts, qr };
    },
    async hide(i, id, on) {
      const el = slides()[i].querySelector('[data-check-id="' + id + '"]');
      el.classList.toggle('__check-hide', on);
      await frames();
    },
    // Lowest contrast between the text colour and any pixel of the screenshot behind it.
    async contrast(png, color) {
      const img = new Image();
      img.src = 'data:image/png;base64,' + png;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      const probe = document.createElement('canvas').getContext('2d');
      probe.fillStyle = color; probe.fillRect(0, 0, 1, 1);
      const [tr, tg, tb] = probe.getImageData(0, 0, 1, 1).data;
      const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
      const lt = lum(tr, tg, tb);
      let worst = Infinity;
      for (let p = 0; p < data.length; p += 4) {
        const lb = lum(data[p], data[p + 1], data[p + 2]);
        const ratio = (Math.max(lt, lb) + 0.05) / (Math.min(lt, lb) + 0.05);
        if (ratio < worst) worst = ratio;
      }
      return worst;
    },
    sideways(i) {
      const slide = slides()[i];
      const w = innerWidth;
      const out = [];
      if (document.documentElement.scrollWidth > w) out.push('the page is ' + document.documentElement.scrollWidth + ' px wide');
      for (const e of [slide, ...slide.querySelectorAll('*')]) {
        if (!shown(e)) continue;
        const r = e.getBoundingClientRect();
        if (r.width > 1 && r.height > 1 && (r.right > w + 0.5 || r.left < -0.5)) out.push(describe(e) + ' spans ' + Math.round(r.left) + ' to ' + Math.round(r.right) + ' px');
      }
      return out;
    },
  };
})();
true`;

const local = (url) => /^(file|data|blob|about):/.test(url);

export async function checkDeck(target, { browser } = {}) {
  const html = statSync(target).isDirectory() ? join(target, 'index.html') : target;
  if (!existsSync(html)) throw new Error(`${html} does not exist`);
  const own = !browser;
  browser ??= await launch();
  const problems = [];
  const contrast = [];
  const add = (slide, check, message) => problems.push({ slide, check, message });
  let count = 0;
  try {
    const page = await openPage(browser, DESKTOP);
    await page.goto(pathToFileURL(resolve(html)).href);
    await page.evaluate(PAGE_HELPERS);
    const ready = await page.evaluate('window.__check.prepare()');
    count = ready.count;
    if (!ready.deck) add(null, 'deck', 'the deck script did not run (window.deck is missing)');
    if (!count) add(null, 'deck', 'no slides found (section.slide inside main.deck)');

    for (let i = 0; i < count && ready.deck; i++) {
      const n = i + 1;
      await page.evaluate(`window.__check.show(${i})`);
      const info = await page.evaluate(`window.__check.inspect(${i})`);

      for (const img of info.images) {
        if (!img.alt || !img.alt.trim()) add(n, 'alt', `image ${img.src} has no alt text`);
        if (!img.loaded) add(n, 'image', `image ${img.src} did not load`);
      }
      for (const el of info.cssImages) add(n, 'alt', `${el} draws an image with CSS, which cannot carry alt text; use <img alt>`);

      if (info.images.some((img) => img.ai === 'photo')) {
        const label = info.labels.find((l) => l.visible);
        if (!label) add(n, 'ai-label', 'a photorealistic AI image has no visible "AI-generated" label');
        else if (label.fontSize < MIN_LABEL_PX)
          add(n, 'ai-label', `the "AI-generated" label is ${label.fontSize} px at 1280 px wide; it needs ${MIN_LABEL_PX} px to be read from the back`);
      }

      for (const t of info.texts) {
        await page.evaluate(`window.__check.hide(${i}, ${t.id}, true)`);
        const png = await page.screenshot(t.rect);
        await page.evaluate(`window.__check.hide(${i}, ${t.id}, false)`);
        const ratio = await page.evaluate(`window.__check.contrast(${JSON.stringify(png)}, ${JSON.stringify(t.color)})`);
        const rounded = Math.floor(ratio * 100) / 100;
        contrast.push({ slide: n, element: t.element, text: t.text, ratio: rounded });
        if (ratio < MIN_CONTRAST)
          add(n, 'contrast', `"${t.text}" reaches ${rounded}:1 against what is behind it; it needs ${MIN_CONTRAST}:1 (raise the panel's dim, or move the panel to a calmer part of the image)`);
      }

      for (const qr of info.qr) {
        if (!qr.drawn) add(n, 'qr', 'the QR code was not drawn');
        if (!/^https?:\/\//.test(qr.url)) add(n, 'qr', `the QR code's address "${qr.url}" is not a web address`);
      }
    }

    if (ready.deck) {
      await page.resize(PHONE.width, PHONE.height);
      for (let i = 0; i < count; i++) {
        await page.evaluate(`window.__check.show(${i})`);
        for (const what of await page.evaluate(`window.__check.sideways(${i})`))
          add(i + 1, 'phone', `at ${PHONE.width} px wide, ${what}: horizontal scroll`);
      }
    }

    for (const url of new Set(page.requests.filter((u) => !local(u))))
      add(null, 'offline', `loads ${url} from the network; bundle it with the deck`);
  } finally {
    if (own) await browser.close();
  }
  const lowest = contrast.length ? Math.min(...contrast.map((c) => c.ratio)) : null;
  return { deck: html, passed: problems.length === 0, slides: count, lowestContrast: lowest, problems, contrast };
}

export function formatReport(report) {
  const lines = report.problems.map((p) => `${p.slide ? `slide ${p.slide}` : 'deck'} [${p.check}]: ${p.message}`);
  const lowest = report.lowestContrast === null ? 'no text measured' : `lowest text contrast ${report.lowestContrast}:1`;
  lines.push(
    report.passed
      ? `Deck check passed: ${report.slides} slides, ${lowest}.`
      : `Deck check failed: ${report.problems.length} problem(s) in ${report.slides} slides, ${lowest}.`,
  );
  return lines.join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const [target] = args.filter((a) => a !== '--json');
  if (!target) {
    console.error('Usage: node check-deck.mjs <deck folder or index.html> [--json]');
    process.exit(2);
  }
  try {
    const report = await checkDeck(target);
    const html = report.deck;
    writeFileSync(join(dirname(html), 'deck-check.json'), JSON.stringify({ ...report, deck: relative(dirname(html), html) }, null, 2) + '\n');
    console.log(json ? JSON.stringify(report, null, 2) : formatReport(report));
    process.exit(report.passed ? 0 : 1);
  } catch (e) {
    if (e instanceof BrowserNotFound) {
      console.error(`Deck check could not run: ${e.message}`);
      process.exit(2);
    }
    throw e;
  }
}
