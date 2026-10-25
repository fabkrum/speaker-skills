#!/usr/bin/env bash
# Puts the rehearsal-coach example talks folder (the talk log with last talk's goal, the brief and
# the sample recording) into the eval's workspace as talks/. Run by `claude plugin eval --scaffold`.
set -euo pipefail
repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cp -R "$repo/skills/rehearsal-coach/examples/talks" ./talks
