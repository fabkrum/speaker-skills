// The contract every skills/*/scripts/check-*.mjs keeps (CODING_STANDARDS.md): when it cannot do
// its job it exits 2 ("could not run"), never 1 ("failed"), and it leaves no report behind, so an
// old report that says "passed" cannot outlive a run that did not check anything.
// None of these cases needs a browser: each must be refused before one starts.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readdirSync, existsSync, rmSync, mkdirSync, chmodSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const scripts = readdirSync(join(root, 'skills'))
  .flatMap((skill) => {
    const dir = join(root, 'skills', skill, 'scripts');
    return existsSync(dir) ? readdirSync(dir).filter((f) => /^check-.*\.mjs$/.test(f)).map((f) => join(dir, f)) : [];
  })
  .map((path) => relative(root, path).split(/[\\/]/).join('/'));

const OLD_REPORT = JSON.stringify({ passed: true, problems: [] });

// Per script: the report it writes (null: none) and an input it must refuse as invalid.
// `invalid(dir)` fills dir and returns the command-line arguments.
const CASES = {
  'skills/html-slides/scripts/check-deck.mjs': {
    report: 'deck-check.json',
    // A deck folder that was never built: deck.json, but no index.html.
    invalid: (dir) => {
      writeFileSync(join(dir, 'deck.json'), JSON.stringify({ slides: [] }));
      return [dir];
    },
  },
  'skills/companion-guide/scripts/check-guide.mjs': {
    report: 'guide-check.json',
    // A guide whose guide.json is not valid JSON, so there is nothing to compare the sections with.
    invalid: (dir) => {
      writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Guide</title>');
      writeFileSync(join(dir, 'guide.json'), '{ "deck": ');
      return [dir];
    },
  },
  'skills/talk-builder/scripts/check-brief.mjs': {
    report: null,
    // A storyboard handed over instead of a brief: not one brief field in it.
    invalid: (dir) => {
      const file = join(dir, 'talk-brief.md');
      writeFileSync(file, '# Storyboard\n\n1. The hook\n2. The proof\n');
      return [file];
    },
  },
};

const dirs = [];
after(() => {
  for (const d of dirs) {
    chmodSync(d, 0o755);
    rmSync(d, { recursive: true, force: true });
  }
});
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'check-scripts-test-'));
  dirs.push(d);
  return d;
};
const run = (script, args) => spawnSync(process.execPath, [join(root, script), ...args], { encoding: 'utf8', timeout: 30000 });

test('the contract covers every check script', () => {
  assert.ok(scripts.length >= 3, `found only ${scripts.join(', ')}`);
  assert.deepEqual(scripts.filter((s) => !(s in CASES)), [], 'a check script without a contract case: add it to CASES');
});

for (const script of scripts) {
  const c = CASES[script];
  if (!c) continue;

  test(`${script} exits 2 on a missing folder and writes nothing`, () => {
    const dir = tmp();
    const missing = join(dir, 'missing');
    const result = run(script, [missing]);
    assert.equal(result.status, 2, `exit ${result.status}: ${result.stderr}`);
    assert.match(result.stderr, /could not run|does not exist|no such/i);
    assert.equal(existsSync(missing), false, 'the run created the missing folder');
    assert.deepEqual(readdirSync(dir), []);
  });

  test(`${script} exits 2 on invalid input and leaves no report behind`, () => {
    const dir = tmp();
    if (c.report) writeFileSync(join(dir, c.report), OLD_REPORT);
    const args = c.invalid(dir);
    const inputs = readdirSync(dir).filter((f) => f !== c.report).sort();
    const result = run(script, args);
    assert.equal(result.status, 2, `exit ${result.status}: ${result.stdout}${result.stderr}`);
    assert.doesNotMatch(result.stderr, /^\s+at /m, 'a stack trace instead of a plain message');
    assert.deepEqual(readdirSync(dir).sort(), inputs, 'the old report survived or the run left output behind');
  });

  if (c.report) {
    // A sealed eval workspace (evals/README.md) is read-only: the old report cannot be removed.
    test(`${script} exits 2, not 1, when the old report cannot be removed`, (t) => {
      const dir = tmp();
      writeFileSync(join(dir, c.report), OLD_REPORT);
      const args = c.invalid(dir);
      chmodSync(dir, 0o555);
      try {
        writeFileSync(join(dir, 'probe'), '');
        rmSync(join(dir, 'probe'));
        t.skip('this user can write to a read-only folder (root)');
        return;
      } catch {}
      const result = run(script, args);
      chmodSync(dir, 0o755);
      assert.equal(result.status, 2, `exit ${result.status}: ${result.stdout}${result.stderr}`);
      assert.match(result.stderr, /could not run/i);
      assert.doesNotMatch(result.stderr, /^\s+at /m, 'a stack trace instead of a plain message');
      assert.equal(readFileSync(join(dir, c.report), 'utf8'), OLD_REPORT);
    });

    test(`${script} exits 2, not 1, when its report path is a folder`, () => {
      const dir = tmp();
      mkdirSync(join(dir, c.report));
      const args = c.invalid(dir);
      const result = run(script, args);
      assert.equal(result.status, 2, `exit ${result.status}: ${result.stdout}${result.stderr}`);
      assert.match(result.stderr, /could not run/i);
      assert.doesNotMatch(result.stderr, /^\s+at /m, 'a stack trace instead of a plain message');
    });
  }
}

test('no check script runs without its input', () => {
  for (const script of scripts) {
    const result = run(script, []);
    assert.equal(result.status, 2, `${script} exit ${result.status}`);
    assert.match(result.stderr, /usage/i, script);
  }
});
