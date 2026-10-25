#!/usr/bin/env node
// Checks a talk brief before anything is built:
//   node check-brief.mjs <talk folder>/talk-brief.md
// The brief is the BRIEF block from references/talk-brief.md, one `Key: value` line per field.
// Exit 0 prints the throughline; exit 1 lists what is missing. No throughline, no build.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MAX_THROUGHLINE_WORDS = 15;
const FIELDS = ['goal', 'outcome', 'next step', 'throughline', 'audience', 'format', 'room', 'style', 'guide'];
const GOALS = ['teach', 'persuade', 'inspire', 'drive action'];
const EMPTY = /^(?:tbd|tba|todo|n\/a|none|\?+|…|\.{3}|-+)?$/i;

export function readBrief(text) {
  const brief = {};
  const line = new RegExp(`^\\s*(${FIELDS.join('|')})\\s*:\\s*(.*?)\\s*$`, 'i');
  for (const l of text.split(/\r?\n/)) {
    const m = l.match(line);
    if (m && !(m[1].toLowerCase() in brief)) brief[m[1].toLowerCase()] = m[2].replace(/\s*\(primary\)$/i, '');
  }
  return brief;
}

export const words = (s) => s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

const given = (v) => typeof v === 'string' && !EMPTY.test(v.trim());

export function checkBrief(brief) {
  const problems = [];
  if (!given(brief.throughline))
    problems.push('Throughline: missing. Write the talk\'s core message as one sentence of at most 15 words; without it there is nothing to build towards.');
  else if (words(brief.throughline) > MAX_THROUGHLINE_WORDS)
    problems.push(`Throughline: ${words(brief.throughline)} words. Cut it to at most ${MAX_THROUGHLINE_WORDS}; if it will not fit, the talk has more than one message.`);

  const goals = GOALS.filter((g) => new RegExp(`\\b${g}\\b`, 'i').test(brief.goal ?? ''));
  if (!given(brief.goal) || goals.length === 0) problems.push(`Goal: missing. Pick one of ${GOALS.join(', ')}.`);
  else if (goals.length > 1) problems.push(`Goal: ${goals.join(' and ')}. Pick the one primary goal; it decides the structure.`);

  if (!given(brief.outcome)) problems.push('Outcome: missing. What should the audience do, think or feel differently afterwards? One answer.');
  if (!given(brief['next step'])) problems.push('Next step: missing. One action people can take this week.');
  if (!given(brief.audience)) problems.push('Audience: missing. Who they are, how many, what they know, what they care about.');

  const format = brief.format ?? '';
  const talk = /\b(?:talk|keynote)\b/i.test(format);
  const workshop = /\bworkshop\b/i.test(format);
  if (!given(format) || talk === workshop) problems.push('Format: talk or workshop? Say which; it changes the whole plan.');
  return problems;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node check-brief.mjs <talk folder>/talk-brief.md');
    process.exit(2);
  }
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    console.error(`No brief at ${file}. Run the brief interview first.`);
    process.exit(1);
  }
  const brief = readBrief(text);
  const problems = checkBrief(brief);
  if (problems.length) {
    console.error(`Brief not ready, nothing gets built yet:\n${problems.map((p) => `- ${p}`).join('\n')}`);
    process.exit(1);
  }
  console.log(`Brief ready. Throughline: ${brief.throughline}`);
}
