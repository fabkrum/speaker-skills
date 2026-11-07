import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkRepo } from '../scripts/check-repo.mjs';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const dir = join(root, 'references');

const TEXTS = [
  'talk-brief.md',
  'story.md',
  'slides.md',
  'concision.md',
  'accessibility.md',
  'delivery.md',
  'rehearsal-rubric.md',
];

const read = (name) => readFileSync(join(dir, name), 'utf8');

test('every reference text exists, plus an index', () => {
  for (const name of [...TEXTS, 'README.md']) assert.ok(existsSync(join(dir, name)), `references/${name} is missing`);
});

test('every reference text passes the repo check', () => {
  const problems = checkRepo(root).filter((p) => p.file.startsWith('references/'));
  assert.deepEqual(problems, []);
});

test('each text names the reader as "the speaker", never Fabian', () => {
  for (const name of [...TEXTS, 'README.md']) {
    const text = read(name);
    assert.match(text, /the speaker/i, `${name} never says "the speaker"`);
    assert.doesNotMatch(text, /Fabian/, `${name} names Fabian`);
  }
});

// Paid-course material: the courses' acronyms, named templates and products.
const COURSE_MATERIAL = [
  /\b(?:[A-Z]\.){2,}[A-Z]?\b/, // dotted acronyms, the courses' signature form
  /Tri-?Summit/i,
  /\b(?:Jester|Warrior|Lover)\b/, // the four voice archetypes
  /Jet Set Speaker|Members Manual|Speakers Academy|Udemy/i,
  /How to Size Up/i,
];

test('no acronym, template or quote from the paid courses appears', () => {
  for (const name of [...TEXTS, 'README.md']) {
    const text = read(name);
    for (const pattern of COURSE_MATERIAL) assert.doesNotMatch(text, pattern, `${name} matches ${pattern}`);
    // A quote attributed to either author is a quote from their material.
    for (const line of text.split('\n')) {
      if (/Harrington|Walker/.test(line)) assert.doesNotMatch(line, /["“][^"”]{12,}["”]/, `${name} quotes a course: ${line}`);
    }
  }
});

test('the course authors are credited as "inspired by"', () => {
  const index = read('README.md');
  assert.match(index, /inspired by[^\n]*Andy Harrington/i);
  assert.match(index, /inspired by[^\n]*TJ Walker/i);
  for (const name of TEXTS) {
    const text = read(name);
    if (/Harrington|Walker/.test(text)) assert.match(text, /inspired by/i, `${name} names a course author without "inspired by"`);
  }
});

test('evidence-based sources keep their citations', () => {
  const cites = {
    'story.md': ['Anderson', 'Duarte', 'Minto', 'Heath', 'Murdock'],
    'slides.md': ['Mayer', 'Alley', 'Reynolds'],
    'concision.md': ['Minto', 'Sweller', 'Bullock'],
    'accessibility.md': ['WCAG', 'Okabe', 'Article 50'],
    'rehearsal-rubric.md': ['Todorov'],
  };
  for (const [name, sources] of Object.entries(cites)) {
    const text = read(name);
    for (const source of sources) assert.ok(text.includes(source), `${name} lost its citation of ${source}`);
  }
});

test('the delivery text has a Q&A section with the three rules', () => {
  const text = read('delivery.md');
  const start = text.search(/^## .*Q&A/m);
  assert.ok(start !== -1, 'no Q&A heading');
  const next = text.slice(start + 1).search(/^## /m);
  const section = next === -1 ? text.slice(start) : text.slice(start, start + 1 + next);
  assert.match(section, /answer first/i);
  assert.match(section, /one sentence/i);
  assert.match(section, /pause/i);
  assert.match(section, /don't know/i);
});

test('the accessibility text covers labelling AI-generated images', () => {
  const text = read('accessibility.md');
  assert.match(text, /AI-generated/);
  assert.match(text, /photorealistic/i);
  assert.match(text, /colophon/i);
});

test('the slides text sets the image-led default', () => {
  const text = read('slides.md');
  assert.match(text, /blurred panel/i);
  assert.match(text, /one sentence/i);
  for (const exception of ['number', 'code', 'comparison']) assert.match(text, new RegExp(exception, 'i'));
});
