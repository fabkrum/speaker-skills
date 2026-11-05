# Coding standards

Rules for the scripts under `skills/*/scripts/`. What a test can check is checked; this page is
for what it cannot.

## Exit codes of a check script (tested)

Every `check-*.mjs` uses the same three exit codes, and `test/check-scripts.test.mjs` holds
each one to them:

- **0**: the input passed.
- **1**: the check ran and the input failed it. Only then, and the problems are printed.
- **2**: the check could not run (no input at that path, an input it cannot read, no browser,
  the check itself broke). Never 1 for these: an agent reads 1 as "fix the input", 2 as "the
  result means nothing yet".

A check that writes a report (`deck-check.json`, `guide-check.json`) removes the old one before
it starts and writes the new one only when it finishes. An old "passed" must never outlive a
run that did not check anything. When it cannot remove the old report or write the new one (a
read-only folder), that is exit 2 too. A new check script needs a case in that test.

## A failed run leaves nothing behind, or names what it left

No test can list every way a script can stop half-way. When a script fails after it has
written something, either remove what it wrote (build into a temporary folder and move it into
place at the end), or say in its error message which files it left and whether they are safe
to use. A half-written deck or guide that looks finished is worse than none.

## A side effect on a real account is undone on failure

A script that changes something on the speaker's own account (a Google Slides deck through
`gws`, a GitHub Pages site) and then fails undoes what it created, or prints exactly what is
left there and how to remove it. The tests run against fakes, so they cannot see the real
account: this rule is kept by reading the code, in review.
