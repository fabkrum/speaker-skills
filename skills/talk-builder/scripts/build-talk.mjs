#!/usr/bin/env node
// Builds the talk's deck with html-slides, but only once the talk is ready for it:
//   node build-talk.mjs <talk folder>/slides/deck.json [--style <speaker-style.md>]
// Looks for talk-brief.md and storyboard-critique.md in the deck's folder or the one above it
// (the talk folder). Refuses to build without a brief that passes check-brief.mjs, which means
// without a throughline, and without a storyboard critique that covers the curse of knowledge
// and the structure. Then builds index.html next to deck.json, in the speaker's style.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readBrief, checkBrief } from './check-brief.mjs';
import { buildDeck, DeckError } from '../../html-slides/scripts/build-deck.mjs';

export const BRIEF_FILE = 'talk-brief.md';
export const CRITIQUE_FILE = 'storyboard-critique.md';
const CRITIQUE_SECTIONS = [
  [/^##\s+curse of knowledge\b/im, 'Curse of knowledge'],
  [/^##\s+structure\b/im, 'Structure'],
];

export class TalkError extends Error {}

function talkFolder(deckDir) {
  for (const dir of [deckDir, dirname(deckDir)]) if (existsSync(join(dir, BRIEF_FILE))) return dir;
  return null;
}

export function buildTalk(deckJson, { stylePath } = {}) {
  const deckDir = dirname(resolve(deckJson));
  const talk = talkFolder(deckDir);
  if (!talk)
    throw new TalkError(`no ${BRIEF_FILE} next to the deck or in the talk folder above it. Run the brief interview first.`);

  const brief = readBrief(readFileSync(join(talk, BRIEF_FILE), 'utf8'));
  const problems = checkBrief(brief);
  if (problems.length) throw new TalkError(`the brief is not ready:\n${problems.map((p) => `- ${p}`).join('\n')}`);

  const critiqueFile = join(talk, CRITIQUE_FILE);
  if (!existsSync(critiqueFile))
    throw new TalkError(`no ${CRITIQUE_FILE} in ${talk}. Critique the headlines-only storyboard before building.`);
  const critique = readFileSync(critiqueFile, 'utf8');
  const missing = CRITIQUE_SECTIONS.filter(([pattern]) => !pattern.test(critique)).map(([, name]) => name);
  if (missing.length)
    throw new TalkError(`${CRITIQUE_FILE} has no "## ${missing.join('" or "## ')}" section. Run the whole early story check.`);

  try {
    return { ...buildDeck(deckJson, { stylePath }), throughline: brief.throughline, talk };
  } catch (e) {
    if (e instanceof DeckError) throw new TalkError(e.message);
    throw e;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const styleAt = args.indexOf('--style');
  const stylePath = styleAt === -1 ? undefined : args.splice(styleAt, 2)[1];
  if (args.length !== 1) {
    console.error('Usage: node build-talk.mjs <talk folder>/slides/deck.json [--style speaker-style.md]');
    process.exit(2);
  }
  try {
    const { out, styleFile, slides, throughline } = buildTalk(args[0], { stylePath });
    const rel = (p) => relative(process.cwd(), p) || p;
    console.log(`Built ${rel(out)}: ${slides} slides, style: ${styleFile ? rel(styleFile) : 'none (default dark scheme)'}`);
    console.log(`Throughline: ${throughline}`);
  } catch (e) {
    if (!(e instanceof TalkError)) throw e;
    console.error(`Deck not built: ${e.message}`);
    process.exit(1);
  }
}
