#!/usr/bin/env node
// The speaker's style file (references/style-file.md): found for every talk, written only once.
//   node style-file.mjs find <talk folder>
//     prints the style file that applies to the talk (its folder or any folder above), exit 0;
//     exit 1 when there is none yet, so the style interview runs.
//   node style-file.mjs write <talks folder> key=value ... [--notes "free notes"]
//     writes <talks folder>/speaker-style.md; refuses when a style file already applies there,
//     and refuses colours that fail the 4.5:1 contrast rule.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findStyle, SCHEMES } from '../../html-slides/scripts/build-deck.mjs';

export const STYLE_FILE = 'speaker-style.md';
export const MIN_CONTRAST = 4.5;
const KEYS = ['look', 'scheme', 'background', 'text', 'accent', 'panel', 'font', 'font-file', 'code-font', 'image-kind', 'motif'];
const COLOURS = ['background', 'text', 'accent', 'panel'];
const HEX = /^#(?:[0-9a-f]{3}){1,2}$/i;

export class StyleError extends Error {}

function luminance(hex) {
  const h = hex.length === 4 ? [...hex.slice(1)].map((c) => c + c).join('') : hex.slice(1);
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function validate(values) {
  for (const [key, value] of Object.entries(values)) {
    if (!KEYS.includes(key)) throw new StyleError(`"${key}" is not a style file key; use ${KEYS.join(', ')}`);
    if (/[\r\n]/.test(String(value))) throw new StyleError(`${key}: keep it to one line; longer notes go below the frontmatter`);
    if (COLOURS.includes(key) && !HEX.test(value)) throw new StyleError(`${key} must be a hex colour like #1a2b3c, not "${value}"`);
  }
  if (values.scheme !== undefined && !(values.scheme in SCHEMES)) throw new StyleError(`scheme is dark or light, not "${values.scheme}"`);
  const scheme = SCHEMES[values.scheme ?? 'dark'];
  const text = values.text ?? scheme.text;
  const background = values.background ?? scheme.background;
  const panel = values.panel ?? values.background ?? scheme.panel;
  const onBackground = contrast(text, background);
  if (onBackground < MIN_CONTRAST)
    throw new StyleError(`text ${text} on background ${background} reaches ${onBackground.toFixed(2)}:1; it needs ${MIN_CONTRAST}:1 or more`);
  const onPanel = contrast(text, panel);
  if (onPanel < MIN_CONTRAST)
    throw new StyleError(`text ${text} on panel ${panel} reaches ${onPanel.toFixed(2)}:1; it needs ${MIN_CONTRAST}:1 or more`);
}

export function writeStyle(dir, values, notes = '') {
  const existing = findStyle(dir);
  if (existing)
    throw new StyleError(`a style file already applies here: ${existing}. Reuse it; edit that file only when the speaker's taste has changed.`);
  validate(values);
  const line = (key) => {
    const value = String(values[key]);
    return `${key}: ${COLOURS.includes(key) || /[#:]/.test(value) ? JSON.stringify(value) : value}`;
  };
  const front = KEYS.filter((k) => values[k] !== undefined && values[k] !== '').map(line);
  const file = join(resolve(dir), STYLE_FILE);
  writeFileSync(file, `---\n${front.join('\n')}\n---\n${notes.trim() ? `\n${notes.trim()}\n` : ''}`, { flag: 'wx' });
  return file;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, dir, ...rest] = process.argv.slice(2);
  if (command === 'find' && dir) {
    const file = findStyle(dir);
    if (!file) {
      console.log(`No style file for ${dir} yet. Run the style interview, then write one.`);
      process.exit(1);
    }
    console.log(`Style file: ${file}\n\n${readFileSync(file, 'utf8')}`);
  } else if (command === 'write' && dir && existsSync(dir)) {
    const at = rest.indexOf('--notes');
    const notes = at === -1 ? '' : rest.splice(at, 2)[1] ?? '';
    const values = {};
    for (const pair of rest) {
      const eq = pair.indexOf('=');
      if (eq < 1) {
        console.error(`"${pair}" is not key=value`);
        process.exit(2);
      }
      values[pair.slice(0, eq)] = pair.slice(eq + 1);
    }
    try {
      console.log(`Wrote ${writeStyle(dir, values, notes)}`);
    } catch (e) {
      if (!(e instanceof StyleError)) throw e;
      console.error(`Style file not written: ${e.message}`);
      process.exit(1);
    }
  } else {
    console.error('Usage: node style-file.mjs find <talk folder>\n       node style-file.mjs write <talks folder> key=value ... [--notes "..."]');
    process.exit(2);
  }
}
