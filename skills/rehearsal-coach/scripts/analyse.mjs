#!/usr/bin/env node
// Measures a rehearsal recording: ffmpeg pulls the audio and samples frames, Whisper writes a
// word-level transcript, measure.mjs turns it into the numbers. Without ffmpeg or Whisper it
// writes the one-page manual checklist instead, and says how to install them.
//
//   node analyse.mjs <recording> [--talk <talk folder>] [--slot <minutes>] [--model small.en] [--language en] [--transcript <whisper json>]
//
// Writes <talk>/rehearsals/take-NN/: transcript.json, measurements.json, frames/ (or checklist.md).
// Exit 0 when measured or when the checklist was written for lack of tools; 1 on bad input;
// 2 when a tool ran and failed (the checklist is written then too).

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, copyFileSync } from 'node:fs';
import { join, dirname, basename, resolve, delimiter, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { readTranscript, measure, checkGoal, mmss } from './measure.mjs';
import { goalToCheck, describeGoalSource, today, REHEARSALS } from './talk-log.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const CHECKLIST = join(here, '..', 'assets', 'manual-checklist.txt');
export const FRAME_EVERY_SECONDS = 5;
// Whisper tends to clean "um" and "uh" out of a transcript; a prompt that contains them keeps them.
const FILLER_PROMPT = "Umm, let me think like, hmm... Okay, here's what I'm, like, thinking.";

export class AnalyseError extends Error {}

export const INSTALL = {
  darwin: ['brew install ffmpeg', 'brew install pipx', 'pipx ensurepath', 'pipx install openai-whisper'],
  win32: ['winget install --id Gyan.FFmpeg -e', 'winget install --id Python.Python.3.12 -e', 'py -m pip install --user pipx', 'py -m pipx ensurepath', 'pipx install openai-whisper'],
  linux: ['sudo apt install ffmpeg pipx', 'pipx ensurepath', 'pipx install openai-whisper'],
};

export function installSteps(platform = process.platform) {
  const steps = INSTALL[platform] ?? INSTALL.linux;
  return [
    `To measure recordings, install ffmpeg and Whisper (${platform === 'win32' ? 'Windows' : platform === 'darwin' ? 'macOS' : 'Linux'}), one command at a time, then open a new terminal:`,
    ...steps.map((s, i) => `  ${i + 1}. ${s}`),
    'The rehearsal-coach skill lists the steps for every system and what each one does.',
  ].join('\n');
}

// Looks a command up on PATH without running it.
export function findExecutable(name, env = process.env) {
  const exts = process.platform === 'win32' ? (env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';') : [''];
  for (const dir of (env.PATH ?? env.Path ?? '').split(delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const file = join(dir, name + ext);
      if (existsSync(file) && statSync(file).isFile()) return file;
    }
  }
  return null;
}

export function findTools(env = process.env) {
  const tools = { ffmpeg: findExecutable('ffmpeg', env), ffprobe: findExecutable('ffprobe', env), whisper: findExecutable('whisper', env) };
  tools.missing = Object.entries(tools).filter(([, v]) => !v).map(([k]) => k);
  return tools;
}

export function nextTake(talkDir) {
  const dir = join(talkDir, REHEARSALS);
  const numbers = existsSync(dir) ? readdirSync(dir).map((d) => d.match(/^take-(\d+)$/)?.[1]).filter(Boolean).map(Number) : [];
  return Math.max(0, ...numbers) + 1;
}

// The slot from the talk brief's Format line ("talk · 20 minutes"), if the talk has a brief.
export function slotFromBrief(talkDir) {
  const file = join(talkDir, 'talk-brief.md');
  if (!existsSync(file)) return undefined;
  const format = readFileSync(file, 'utf8').match(/^\s*format\s*:(.*)$/im)?.[1] ?? '';
  const m = format.match(/(\d+(?:[.,]\d+)?)\s*(?:min|minutes?)\b/i);
  return m ? Number(m[1].replace(',', '.')) : undefined;
}

export function writeChecklist(takeDir, { talk, take, date, goal }) {
  let text = readFileSync(CHECKLIST, 'utf8');
  const fill = (blank, value) => (value ? value.padEnd(blank.length) : blank);
  text = text
    .replace(/Talk: (_+)/, (_, b) => `Talk: ${fill(b, talk)}`)
    .replace(/Take: (_+)/, (_, b) => `Take: ${fill(b, String(take))}`)
    .replace(/Date: (_+)/, (_, b) => `Date: ${fill(b, date)}`)
    .replace(/Goal from last time: (_+)/, (_, b) => `Goal from last time: ${fill(b, goal?.goal.text)}`);
  const file = join(takeDir, 'checklist.md');
  mkdirSync(takeDir, { recursive: true });
  writeFileSync(
    file,
    [
      `# Rehearsal checklist: ${talk}, take ${take}`,
      '',
      'Record the run-through on a phone, watch it back once at normal speed, and fill this in.',
      goal ? `Check the goal first: ${goal.goal.text} (${describeGoalSource(goal).toLowerCase()}).` : 'There is no goal from an earlier take or talk yet.',
      '',
      '```',
      text.trimEnd(),
      '```',
      '',
    ].join('\n'),
  );
  return file;
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error || r.status !== 0) {
    const tail = `${r.stderr ?? ''}${r.error?.message ?? ''}`.trim().split('\n').slice(-5).join('\n');
    throw new AnalyseError(`${basename(cmd)} failed: ${tail}`);
  }
  return r.stdout;
}

function sampleFrames(tools, recording, takeDir) {
  const frames = join(takeDir, 'frames');
  rmSync(frames, { recursive: true, force: true });
  mkdirSync(frames, { recursive: true });
  // One frame every few seconds for the whole run, and one a second for the first five seconds.
  run(tools.ffmpeg, ['-v', 'error', '-y', '-i', recording, '-vf', `fps=1/${FRAME_EVERY_SECONDS},scale=640:-2`, join(frames, 'every-%04d.jpg')]);
  run(tools.ffmpeg, ['-v', 'error', '-y', '-i', recording, '-t', '5', '-vf', 'fps=1,scale=640:-2', join(frames, 'first-%04d.jpg')]);
  const out = [];
  for (const f of readdirSync(frames).sort()) {
    const m = f.match(/^(every|first)-(\d+)\.jpg$/);
    if (!m) continue;
    const seconds = (Number(m[2]) - 1) * (m[1] === 'every' ? FRAME_EVERY_SECONDS : 1);
    const name = `frame-${mmss(seconds).replace(':', 'm')}s.jpg`;
    if (existsSync(join(frames, name))) rmSync(join(frames, f));
    else renameSync(join(frames, f), join(frames, name));
    if (!out.some((o) => o.file === name)) out.push({ t: mmss(seconds), file: `frames/${name}` });
  }
  return out.sort((a, b) => a.t.localeCompare(b.t));
}

export function analyse(recording, { talk, slot, language = 'en', model = language === 'en' ? 'small.en' : 'small', transcript, env = process.env } = {}) {
  recording = resolve(recording);
  if (!existsSync(recording)) throw new AnalyseError(`No recording at ${recording}.`);
  const talkDir = resolve(talk ?? dirname(recording));
  const take = nextTake(talkDir);
  const takeDir = join(talkDir, REHEARSALS, `take-${String(take).padStart(2, '0')}`);
  const goal = goalToCheck(talkDir);
  const date = today();
  const base = { talk: basename(talkDir), take, date, takeDir, goal };

  const tools = findTools(env);
  const needed = transcript ? [] : tools.missing;
  if (needed.length) {
    const checklist = writeChecklist(takeDir, base);
    return { ...base, manual: true, missing: needed, checklist };
  }

  try {
    mkdirSync(takeDir, { recursive: true });
    const transcriptFile = join(takeDir, 'transcript.json');
    if (transcript) copyFileSync(resolve(transcript), transcriptFile);
    else {
      const wav = join(takeDir, 'audio.wav');
      run(tools.ffmpeg, ['-v', 'error', '-y', '-i', recording, '-vn', '-ac', '1', '-ar', '16000', wav]);
      const args = [wav, '--model', model, '--word_timestamps', 'True', '--output_format', 'json', '--output_dir', takeDir, '--fp16', 'False', '--language', language];
      if (language === 'en') args.push('--initial_prompt', FILLER_PROMPT);
      run(tools.whisper, args);
      renameSync(join(takeDir, 'audio.json'), transcriptFile);
      rmSync(wav, { force: true });
    }

    let words;
    try {
      words = readTranscript(JSON.parse(readFileSync(transcriptFile, 'utf8')));
    } catch (e) {
      throw new AnalyseError(`The transcript could not be read: ${e.message}`);
    }
    const slotMinutes = slot ? Number(slot) : slotFromBrief(talkDir);
    const m = measure(words, { slotMinutes });

    let frames = [];
    if (tools.ffmpeg && tools.ffprobe) {
      const streams = run(tools.ffprobe, ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', recording]);
      if (/video/.test(streams)) frames = sampleFrames(tools, recording, takeDir);
    }

    const measurements = {
      talk: base.talk,
      take,
      date,
      recording: relative(takeDir, recording).split('\\').join('/'),
      goalToCheck: goal,
      goalCheck: goal ? checkGoal(goal.goal, m) : null,
      ...m,
      frames,
    };
    writeFileSync(join(takeDir, 'measurements.json'), `${JSON.stringify(measurements, null, 2)}\n`);
    return { ...base, manual: false, measurements };
  } catch (e) {
    if (!(e instanceof AnalyseError)) throw e;
    const checklist = writeChecklist(takeDir, base);
    e.checklist = checklist;
    throw e;
  }
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

function summary(r) {
  const m = r.measurements;
  const lines = [`Take ${r.take} of "${r.talk}" measured: ${r.takeDir}`];
  if (r.goal) {
    const check = m.goalCheck;
    lines.push(`${describeGoalSource(r.goal)}: ${r.goal.goal.text}` + (check ? ` → ${check.met ? 'met' : 'not met'} (${check.label}: ${check.actual})` : ' → judge it from the recording'));
  } else lines.push('No goal from an earlier take or talk to check.');
  lines.push(`Runtime ${m.runtime}` + (m.slotMinutes ? ` against a ${m.slotMinutes}-minute slot (${m.overSlotSeconds >= 0 ? `${m.overSlotSeconds} s over` : `${-m.overSlotSeconds} s under`})` : ''));
  lines.push(`${m.words} words, ${m.wpm} words per minute (by minute: ${m.wpmByMinute.map((x) => `${x.t} ${x.wpm}`).join(', ')})`);
  lines.push(`Fillers: ${m.fillers.total} (${m.fillers.perMinute} per minute): ${Object.entries(m.fillers.counts).map(([k, v]) => `${k} ×${v}`).join(', ') || 'none'}`);
  lines.push(`Pauses of 1.5 s or more: ${m.pauses.count}, longest ${m.pauses.longestSeconds} s`);
  lines.push(m.frames.length ? `Frames: ${m.frames.length} in frames/, look at them for body language` : 'Frames: none (no video stream)');
  return lines.join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts._[0]) {
    console.error('Usage: node analyse.mjs <recording> [--talk <talk folder>] [--slot <minutes>] [--model small.en] [--language en] [--transcript <whisper json>]');
    process.exit(1);
  }
  try {
    const r = analyse(opts._[0], opts);
    if (r.manual) {
      console.log(`Not installed: ${r.missing.join(', ')}. No measurements this time; use the manual checklist instead:\n  ${r.checklist}\n`);
      console.log(installSteps());
    } else console.log(summary(r));
  } catch (e) {
    if (!(e instanceof AnalyseError)) throw e;
    console.error(e.message);
    if (e.checklist) {
      console.error(`\nCould not measure this recording. The manual checklist is ready instead:\n  ${e.checklist}`);
      process.exit(2);
    }
    process.exit(1);
  }
}
