#!/usr/bin/env node
// Repo check: private leftovers anywhere in the repo, Agent Skills compliance under skills/.
// Usage: node scripts/check-repo.mjs [root]   (exit 1 on any problem)
//
// The patterns are written so that this file does not match itself (e.g. `baq(?:e)nd`),
// which is why no file is exempt from the scan.

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative, sep, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const LEAKS = [
  { pattern: /\/(?:Users|home)\/[^\s/]/, message: 'home-directory path' },
  { pattern: /\b[A-Za-z]:\\Users\\/, message: 'home-directory path' },
  { pattern: /(?<![\w-])fk:[a-z]/, message: 'private skill name' },
  { pattern: /speed[\s-]?kit|baq(?:e)nd/i, message: 'employer name' },
  { pattern: /\bPSA\b|Professional Speaking Associat(?:ion)/, message: 'private course material' },
  { pattern: /[\w.+-]+@([\w-]+(?:\.[\w-]+)+)/, message: 'email address', allow: (m) => /(^|\.)example\.(com|org|net)$/i.test(m[1]) },
];

const PLUGIN_ROOT = /\$\{CLAUDE_PLUGIN_ROOT\}/;

// Frontmatter fields defined by the Agent Skills spec (agentskills.io/specification).
const SPEC_KEYS = new Set(['name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools']);
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_NAME = 64;
const MAX_DESCRIPTION = 1024;
const MAX_COMPATIBILITY = 500;

function listFiles(root) {
  if (existsSync(join(root, '.git'))) {
    const out = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' });
    return out.split('\0').filter((f) => f && existsSync(join(root, f)));
  }
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else files.push(relative(root, path).split(sep).join('/'));
    }
  };
  walk(root);
  return files;
}

function scanLeaks(file, text) {
  const problems = [];
  text.split(/\r?\n/).forEach((line, i) => {
    for (const leak of LEAKS) {
      const m = line.match(leak.pattern);
      if (m && !(leak.allow && leak.allow(m))) problems.push({ file: `${file}:${i + 1}`, message: leak.message });
    }
  });
  return problems;
}

// Minimal YAML for SKILL.md frontmatter: top-level `key: value`, quoted scalars,
// `>`/`|` block scalars, plain scalars continued on indented lines, and nested maps.
export function parseFrontmatter(text) {
  const lines = text.split(/\r?\n/);
  if (lines[0] !== '---') return null;
  const end = lines.indexOf('---', 1);
  if (end === -1) return null;
  const data = {};
  let i = 1;
  while (i < end) {
    const m = lines[i].match(/^([\w-]+):\s*(.*)$/);
    i++;
    if (!m) continue;
    const [, key, raw] = m;
    const body = [];
    while (i < end && (/^\s/.test(lines[i]) || lines[i] === '')) body.push(lines[i++].trim());
    while (body.length && body.at(-1) === '') body.pop();
    if (/^[>|][+-]?$/.test(raw)) {
      data[key] = raw[0] === '>' ? body.join(' ') : body.join('\n');
    } else if (raw === '' && body.length) {
      data[key] = {}; // nested map, e.g. metadata
    } else {
      const value = [raw, ...body].filter(Boolean).join(' ');
      data[key] = value.replace(/^(['"])(.*)\1$/, '$2');
    }
  }
  return data;
}

function checkSkill(root, dir) {
  const folder = `skills/${dir}`;
  const path = join(root, 'skills', dir, 'SKILL.md');
  if (!existsSync(path)) return [{ file: folder, message: 'no SKILL.md' }];
  const file = `${folder}/SKILL.md`;
  const text = readFileSync(path, 'utf8');
  const fm = parseFrontmatter(text);
  if (!fm) return [{ file, message: 'no YAML frontmatter' }];
  const problems = [];
  const add = (message) => problems.push({ file, message });

  for (const key of Object.keys(fm)) if (!SPEC_KEYS.has(key)) add(`frontmatter key "${key}" is not in the Agent Skills spec`);

  if (typeof fm.name !== 'string' || !fm.name) add('name is missing');
  else if (!NAME.test(fm.name) || fm.name.length > MAX_NAME)
    add(`name "${fm.name}" must be 1-${MAX_NAME} lowercase letters, digits and single hyphens`);
  else if (fm.name !== dir) add(`name "${fm.name}" does not match folder "${dir}"`);

  if (typeof fm.description !== 'string' || !fm.description) add('description is missing');
  else if (fm.description.length > MAX_DESCRIPTION)
    add(`description is ${fm.description.length} characters, the limit is ${MAX_DESCRIPTION}`);

  if (typeof fm.compatibility === 'string' && fm.compatibility.length > MAX_COMPATIBILITY)
    add(`compatibility is ${fm.compatibility.length} characters, the limit is ${MAX_COMPATIBILITY}`);

  return problems;
}

export function checkRepo(root) {
  const problems = [];
  const files = listFiles(root);
  for (const file of files) {
    const buffer = readFileSync(join(root, file));
    if (buffer.includes(0)) continue; // binary
    const text = buffer.toString('utf8');
    problems.push(...scanLeaks(file, text));
    if (file.startsWith('skills/') && PLUGIN_ROOT.test(text))
      problems.push({ file, message: 'plugin-root variable; skills must not depend on Claude Code plugin paths' });
  }
  const skillsDir = join(root, 'skills');
  if (existsSync(skillsDir)) {
    for (const dir of readdirSync(skillsDir).sort()) {
      if (statSync(join(skillsDir, dir)).isDirectory()) problems.push(...checkSkill(root, dir));
    }
  }
  return problems;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(process.argv[2] ?? join(fileURLToPath(import.meta.url), '..', '..'));
  const problems = checkRepo(root);
  for (const p of problems) console.error(`${p.file}: ${p.message}`);
  if (problems.length) {
    console.error(`\nRepo check failed: ${problems.length} problem(s).`);
    process.exit(1);
  }
  console.log('Repo check passed.');
}
