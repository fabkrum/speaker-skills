import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkRepo } from './check-repo.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const script = join(repoRoot, 'scripts', 'check-repo.mjs');

const goodSkill = `---
name: demo
description: A demo skill.
---

# Demo
`;

// Builds a throwaway repo (no .git, so the check walks the folder).
function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), 'check-repo-'));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

function messages(root) {
  return checkRepo(root).map((p) => `${p.file}: ${p.message}`);
}

test('a clean repo has no problems', () => {
  const root = fixture({ 'skills/demo/SKILL.md': goodSkill, 'README.md': '# Hi\n' });
  assert.deepEqual(messages(root), []);
});

test('this repository passes its own check', () => {
  assert.deepEqual(messages(repoRoot), []);
});

// Leak strings are assembled at runtime so this file does not trip the check itself.
const leaks = {
  'a macOS home path': ['/Us', 'ers/someone/talks'].join(''),
  'a Linux home path': ['/ho', 'me/someone/talks'].join(''),
  'a Windows home path': ['C:\\Us', 'ers\\someone'].join(''),
  'a private skill name': ['f', 'k:writing'].join(''),
  'a home path with a tilde': ['~', '/talks/deck'].join(''),
  'a home path with $HOME': ['$HO', 'ME/talks/deck'].join(''),
  'a home path with ${HOME}': ['${HO', 'ME}/talks'].join(''),
  'an employer name': ['Speed', ' Kit'].join(''),
  'an employer name with an underscore': ['Speed', '_Kit'].join(''),
  'another employer name': ['Baq', 'end'].join(''),
  'an email address': ['someone', '@', 'mail.test'].join(''),
  'private course material': ['P', 'SA manual'].join(''),
};

for (const [label, leak] of Object.entries(leaks)) {
  test(`flags ${label}`, () => {
    const root = fixture({ 'skills/demo/SKILL.md': goodSkill, 'notes.md': `see ${leak}\n` });
    const found = messages(root);
    assert.equal(found.length, 1, found.join('\n'));
    assert.match(found[0], /^notes\.md:1: /);
  });
}

test('allows example email addresses', () => {
  const root = fixture({ 'skills/demo/SKILL.md': goodSkill, 'a.md': `${['you', '@', 'example.com'].join('')}\n` });
  assert.deepEqual(messages(root), []);
});

test('flags every email address on a line, not only the first', () => {
  const line = `${['you', '@', 'example.com'].join('')} or ${['someone', '@', 'mail.test'].join('')} or ${['other', '@', 'mail.test'].join('')}\n`;
  const found = messages(fixture({ 'skills/demo/SKILL.md': goodSkill, 'a.md': line }));
  assert.deepEqual(found, ['a.md:1: email address', 'a.md:1: email address']);
});

// Tool names are assembled at runtime for the same reason as the leaks above.
const named = (tool) => [tool, ' tool'].join('');
for (const tool of ['Bash', 'Read', 'Write', 'Edit', 'Grep', 'Glob', 'WebFetch', 'WebSearch']) {
  test(`flags a skill that names the ${tool} agent tool`, () => {
    const skill = `${goodSkill}\nRun it again with the ${named(tool)}'s override.\n`;
    const found = messages(fixture({ 'skills/demo/SKILL.md': skill }));
    assert.deepEqual(found, [`skills/demo/SKILL.md:8: names an agent tool ("${named(tool)}"); say what to do, not which tool does it`]);
  });
}

test('flags a named agent tool in a skill reference too, but not outside skills', () => {
  const found = messages(fixture({
    'skills/demo/SKILL.md': goodSkill,
    'skills/demo/references/a.md': `Use the ${named('WebFetch')}.\n`,
    'docs/notes.md': `Use the ${named('WebFetch')}.\n`,
  }));
  assert.deepEqual(found, [`skills/demo/references/a.md:1: names an agent tool ("${named('WebFetch')}"); say what to do, not which tool does it`]);
});

test('does not flag tools named by what they do', () => {
  const skill = `${goodSkill}\nUse whatever image tool you have. Read the tool's output. Edit tools vary.\n`;
  assert.deepEqual(messages(fixture({ 'skills/demo/SKILL.md': skill })), []);
});

test('flags a description over 1024 characters', () => {
  const skill = `---\nname: demo\ndescription: ${'x'.repeat(1025)}\n---\n`;
  const found = messages(fixture({ 'skills/demo/SKILL.md': skill }));
  assert.equal(found.length, 1);
  assert.match(found[0], /description is 1025 characters/);
});

test('flags a skill folder without SKILL.md', () => {
  const found = messages(fixture({ 'skills/demo/references/a.md': 'x\n' }));
  assert.deepEqual(found, ['skills/demo: no SKILL.md']);
});

test('flags a SKILL.md without frontmatter', () => {
  const found = messages(fixture({ 'skills/demo/SKILL.md': '# Demo\n' }));
  assert.deepEqual(found, ['skills/demo/SKILL.md: no YAML frontmatter']);
});

test('flags a name that does not match its folder', () => {
  const found = messages(fixture({ 'skills/other/SKILL.md': goodSkill }));
  assert.deepEqual(found, ['skills/other/SKILL.md: name "demo" does not match folder "other"']);
});

test('flags an invalid name', () => {
  const skill = goodSkill.replace('name: demo', 'name: Demo--Skill');
  const found = messages(fixture({ 'skills/Demo--Skill/SKILL.md': skill }));
  assert.equal(found.length, 1);
  assert.match(found[0], /name "Demo--Skill" must be/);
});

test('flags a missing description', () => {
  const found = messages(fixture({ 'skills/demo/SKILL.md': '---\nname: demo\n---\n' }));
  assert.deepEqual(found, ['skills/demo/SKILL.md: description is missing']);
});

test('flags frontmatter keys outside the Agent Skills spec', () => {
  const skill = goodSkill.replace('---\n\n', 'model: opus\n---\n\n');
  const found = messages(fixture({ 'skills/demo/SKILL.md': skill }));
  assert.deepEqual(found, ['skills/demo/SKILL.md: frontmatter key "model" is not in the Agent Skills spec']);
});

test('reads a folded multi-line description', () => {
  const skill = `---\nname: demo\ndescription: >\n  Line one\n  ${'y'.repeat(1020)}\n---\n`;
  const found = messages(fixture({ 'skills/demo/SKILL.md': skill }));
  assert.equal(found.length, 1);
  assert.match(found[0], /description is 1029 characters/);
});

test('flags a plugin-root variable in a skill', () => {
  const variable = ['${CLAUDE', '_PLUGIN_ROOT}'].join('');
  const skill = `${goodSkill}Run ${variable}/x.sh\n`;
  const found = messages(fixture({ 'skills/demo/SKILL.md': skill }));
  assert.equal(found.length, 1);
  assert.match(found[0], /plugin-root variable/);
});

test('the command exits 1 and names the file on a planted leak', () => {
  const root = fixture({ 'skills/demo/SKILL.md': goodSkill, 'notes.md': `${leaks['a macOS home path']}\n` });
  const run = spawnSync(process.execPath, [script, root], { encoding: 'utf8' });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /notes\.md:1: home-directory path/);
});

test('the command exits 0 on a clean repo', () => {
  const root = fixture({ 'skills/demo/SKILL.md': goodSkill });
  const run = spawnSync(process.execPath, [script, root], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
});
