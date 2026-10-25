# Evals

`claude plugin eval` suites, one folder per case. Each case gives the plugin a realistic
request and grades what it produces; the built-in no-plugin baseline shows whether the skill
adds value.

| Case | Skill | What it grades |
|---|---|---|
| `html-slides-storyboard` | `html-slides` | A storyboard becomes an offline deck that passes the deck check |
| `talk-builder-brief-first` | `talk-builder` | A request for slides gets the brief interview first: no critique, no deck, no invented throughline |
| `talk-builder-storyboard-critique` | `talk-builder` | Brief + storyboard → a critique file with curse-of-knowledge findings per slide and the structure, no deck |
| `talk-builder-deck` | `talk-builder` | Brief + storyboard + style answers → a style file in the talks folder and a deck in that style that passes the deck check |

Run from the repo folder. The cases write files and run the skills' scripts, so they need
Bash, Write and Edit, and the deck check needs Google Chrome on the machine:

```
claude plugin eval . --allow-tools Bash Write Edit
```

The deck check is the same script the skill runs (`skills/html-slides/scripts/check-deck.mjs`).
It writes `deck-check.json` next to the deck; the `deck-check-passed` graders read that file.

## Known limit: the deck check inside the eval sandbox

`claude plugin eval` runs the agent's shell commands inside an OS sandbox, and on macOS that
sandbox stops Chrome from starting at all. The check then exits with code 2 ("could not run"),
the skill tells the speaker it could not verify the deck, and the `deck-check-passed` grader
fails because there is no `deck-check.json`. Every other grader passes (6 of 7 on
2026-10-25), and the deck the agent built passed the check when run outside the sandbox
(`node skills/html-slides/scripts/check-deck.mjs <the run's deck folder>`, kept with
`--keep-temp`). The grader stays: it is the one that proves the deck works, and it turns green
once the eval can run the check, for example on Linux or when the eval tool lets a case run a
command unsandboxed.

The same limit applies to `talk-builder-deck`'s `deck-check-passed` grader, which reads the same
report. The two other `talk-builder` cases run no browser.

Results on 2026-10-25, one run per arm:

| Case | With plugin | Without | Δ |
|---|---|---|---|
| `talk-builder-brief-first` | 1.00 | 0.25 | +0.75 |
| `talk-builder-storyboard-critique` | 1.00 | 0.17 | +0.83 |
