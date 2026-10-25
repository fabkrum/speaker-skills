#!/usr/bin/env node
// The take log (every rehearsal of one talk) and the talk log (one entry per talk given, across
// talks), and the one goal the next rehearsal checks first. references/rehearsal-rubric.md §6.
//
//   node talk-log.mjs goal <talk folder>
//       prints the goal this talk's next rehearsal checks first
//   node talk-log.mjs add <talks folder> <talk name> --goal "..." [--metric <m> --max <n> | --min <n>] [--notes "..."] [--date YYYY-MM-DD]
//       adds the talk just given, and the one goal for the next talk, to the talk log

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GOAL_METRICS } from './measure.mjs';

export const TALK_LOG = 'talk-log.json';
export const REHEARSALS = 'rehearsals';
export const TAKE_LOG = 'takes.json';

export class LogError extends Error {}

const readJson = (file, fallback) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback);
const writeJson = (file, data) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
};
export const today = () => new Date().toISOString().slice(0, 10);

// The talk log sits in the talks folder, next to speaker-style.md; a talk finds it by walking up.
export function findTalkLog(talkDir) {
  for (let dir = dirname(resolve(talkDir)); ; dir = dirname(dir)) {
    if (existsSync(join(dir, TALK_LOG))) return join(dir, TALK_LOG);
    if (dirname(dir) === dir) return null;
  }
}

export const readTalkLog = (file) => readJson(file, { talks: [] });
export const readTakeLog = (talkDir) => readJson(join(talkDir, REHEARSALS, TAKE_LOG), { talk: basename(resolve(talkDir)), takes: [] });

// A goal is measurable: it names a metric the coach measures with a target, or its text holds a number.
export function goalProblems(goal, where = 'goal') {
  const problems = [];
  if (!goal || typeof goal.text !== 'string' || !goal.text.trim()) return [`${where}: missing. One change, with a measurable target.`];
  if (goal.metric !== undefined) {
    if (!GOAL_METRICS[goal.metric]) problems.push(`${where}: metric "${goal.metric}" is not one of ${Object.keys(GOAL_METRICS).join(', ')}.`);
    if (typeof goal.max !== 'number' && typeof goal.min !== 'number') problems.push(`${where}: metric "${goal.metric}" needs a number as max or min.`);
  } else if (!/\d/.test(goal.text)) {
    problems.push(`${where}: "${goal.text}" is not measurable. Give a number to reach ("fillers per minute under 2"), or a metric with max or min.`);
  }
  return problems;
}

export function addTalk(talksDir, { talk, goal, notes = '', date = today() }) {
  if (!talk) throw new LogError('Name the talk.');
  const problems = goalProblems(goal, 'Goal for the next talk');
  if (problems.length) throw new LogError(problems.join('\n'));
  const file = join(resolve(talksDir), TALK_LOG);
  const log = readTalkLog(file);
  log.talks.push({ talk, date, notes, goal });
  writeJson(file, log);
  return file;
}

// What the next rehearsal of this talk checks first: the goal the last take set, or, before the
// first take, the goal the last talk in the talk log set for the next one.
export function goalToCheck(talkDir) {
  const { takes } = readTakeLog(talkDir);
  const last = takes.at(-1);
  if (last?.goal) return { source: 'take', take: last.take, goal: last.goal };
  const file = findTalkLog(talkDir);
  if (!file) return null;
  const name = basename(resolve(talkDir));
  const entry = readTalkLog(file).talks.filter((t) => t.talk !== name && t.goal).at(-1);
  return entry ? { source: 'talk', talk: entry.talk, date: entry.date, goal: entry.goal } : null;
}

export function describeGoalSource(g) {
  if (!g) return 'Goal from last time';
  return g.source === 'take' ? `Goal from take ${g.take}` : `Goal from your last talk ("${g.talk}", ${g.date})`;
}

function parseArgs(argv) {
  const opts = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const m = argv[i].match(/^--(.+)$/);
    if (m) opts[m[1]] = argv[++i];
    else opts._.push(argv[i]);
  }
  return opts;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...rest] = process.argv.slice(2);
  const opts = parseArgs(rest);
  try {
    if (command === 'goal' && opts._[0]) {
      const g = goalToCheck(opts._[0]);
      if (!g) console.log('No goal to check yet: no earlier take of this talk, and no goal in a talk log.');
      else console.log(`${describeGoalSource(g)}: ${g.goal.text}`);
    } else if (command === 'add' && opts._.length === 2) {
      const goal = { text: opts.goal };
      if (opts.metric) goal.metric = opts.metric;
      if (opts.max !== undefined) goal.max = Number(opts.max);
      if (opts.min !== undefined) goal.min = Number(opts.min);
      const file = addTalk(opts._[0], { talk: opts._[1], goal, notes: opts.notes, date: opts.date });
      console.log(`Added "${opts._[1]}" to ${file}. Its next talk's first rehearsal checks: ${goal.text}`);
    } else {
      console.error('Usage:\n  node talk-log.mjs goal <talk folder>\n  node talk-log.mjs add <talks folder> <talk name> --goal "..." [--metric <m> --max <n> | --min <n>] [--notes "..."]');
      process.exit(2);
    }
  } catch (e) {
    if (!(e instanceof LogError)) throw e;
    console.error(e.message);
    process.exit(1);
  }
}
