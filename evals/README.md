# Evals

`claude plugin eval` suites, one folder per case. Each case gives the plugin a realistic
request and grades what it produces; the built-in no-plugin baseline shows whether the skill
adds value.

| Case | Skill | What it grades |
|---|---|---|
| `html-slides-storyboard` | `html-slides` | A storyboard becomes an offline deck that passes the deck check |

Run from the repo folder. The cases write files and run the skills' scripts, so they need
Bash, Write and Edit, and the deck check needs Google Chrome on the machine:

```
claude plugin eval . --allow-tools Bash Write Edit
```

The deck check is the same script the skill runs (`skills/html-slides/scripts/check-deck.mjs`).
It writes `deck-check.json` next to the deck; the `deck-check-passed` grader reads that file.

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
