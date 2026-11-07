---
name: rehearsal-coach
description: Coaches a speaker from a recording of a rehearsal or a real talk - measures it with ffmpeg and Whisper (word-level transcript, words per minute and where the pace spikes, fillers and hedges per minute with timestamps, pauses after key lines, sampled frames for body language), judges it from the audience's seat (does it land, how likely they take the next step 0-10), scores nine dimensions red, yellow or green with timestamped receipts, and writes a report with the top three fixes and one measurable goal. Keeps a take log per talk and a talk log across talks, so each rehearsal opens by checking the last goal and each talk's last goal is the first thing the next talk's first rehearsal checks. Without ffmpeg or Whisper it falls back to a one-page manual checklist. Use when the speaker has recorded a run-through or a talk, asks for feedback on their delivery, filler words, pace or body language, or wants to know if they are getting better.
license: MIT-0
compatibility: Needs Node.js 22 or later. Measuring needs ffmpeg (with ffprobe) and OpenAI Whisper on the PATH; without them the skill falls back to the manual checklist. Reading body language from the frames needs a model that can look at images.
---

# rehearsal-coach

Turns a recording into numbers, a verdict from the audience's seat and one goal for next time,
and keeps every take so the speaker can see whether they are getting better. A recording shows
what the speaker cannot feel in the moment; the coach's job is to make that specific.

The method is `references/rehearsal-rubric.md` in this repository: what to measure, the nine
dimensions, the report, the logs and the manual checklist. Read it before the first review.
`references/delivery.md` (voice, eyes, body) and `references/concision.md` (answer first,
over-explaining) are the standards behind dimensions 4 to 6.

Be specific and honest. A timestamped finding helps; vague encouragement does not. Praise what is
genuinely strong in one line and spend the rest on what to change.

## The folders

The take log lives in the talk's folder, the talk log in the folder that holds all the talks,
next to the style file that `talk-builder` writes:

```
talks/
  talk-log.json                 ← one entry per talk given, each with one goal for the next talk
  rehearse-with-your-phone/
    talk-brief.md               ← the slot, the audience, the next step
    rehearsal-1.mp4
    rehearsals/
      takes.json                ← every take of this talk, appended, never overwritten
      take-01/
        transcript.json  measurements.json  frames/  review.json  report.md
```

`examples/talks/` in this skill is that layout with a sample recording and a talk log that holds
the goal from an earlier talk.

## 1. Measure

Ask for the recording (a local file; any format ffmpeg reads, video or audio only) and where the
talk's folder is. Then, from this skill's folder:

```
node scripts/analyse.mjs <recording> --talk <talk folder>
```

It extracts the audio, runs Whisper with word timestamps, measures, samples a frame every five
seconds plus one a second for the first five seconds, and writes `rehearsals/take-NN/`. It
prints, first, the goal this rehearsal has to check (from the last take of this talk, or before
the first take, from the last talk in the talk log) and whether the numbers met it. Then the
runtime against the slot in the brief (`--slot <minutes>` if there is no brief), words per minute
by minute, every filler with its timestamp, and every pause of 1.5 seconds or more with the words
before it.

Whisper's first run downloads its model (about 500 MB for `small.en`) and a minute of speech
takes a few seconds to a minute to transcribe. For a talk in another language pass
`--language <code>`; the filler list is English, so count fillers by ear then.

**If it says the tools are not installed**, that is not an error: it has written the manual
checklist into the take folder instead (section 5). Offer the install steps below, once, and go
on with the checklist; never leave the speaker without feedback because a tool is missing.

**If it exits 2**, a tool ran and failed (a broken file, a Whisper error). Show the error, and use
the checklist it wrote meanwhile.

## 2. Watch, then judge from the audience's seat

The numbers are not the review. Before writing anything:

1. Read the brief: the audience, the throughline, the one next step, the slot.
2. Read `transcript.json` against the brief: where the throughline is said, whether the next step
   is stated at the end, where a point is made twice or wound up to (`concision.md`).
3. Look at the frames in `frames/`, all of the first five seconds and then across the run: eyes on
   the room or on the screen, notes or floor; posture; nervous habits; gestures. Estimate the share
   of frames with the eyes off the audience. If you cannot look at images, say so and ask the
   speaker to watch for those points; do not guess.
4. Listen before quoting a filler count: automatic transcripts sometimes drop or add an "um".

Then answer the rubric's two questions in the audience's voice: does it land (yes, partly, no,
and where they get lost), and how likely they are to take the next step, 0 to 10. Every finding
below matters only as far as it moves those two answers.

## 3. Write the review, then the report

Write `rehearsals/take-NN/review.json`:

```json
{
  "verdict": "One line: would it land with this audience, and the single biggest problem.",
  "audience": { "lands": "partly", "nextStepLikelihood": 6, "voice": "As a junior developer who ..., I ..." },
  "scores": {
    "timing":      { "status": "green",  "reason": "..." },
    "fillers":     { "status": "red",    "reason": "...", "evidence": "00:41 \"I think ... uh, basically\"", "fix": "..." },
    "pauses":      { "status": "green",  "reason": "..." },
    "answerFirst": { "status": "yellow", "reason": "...", "evidence": "01:10 ...", "fix": "..." },
    "voice":       { "status": "...", "reason": "..." },
    "body":        { "status": "...", "reason": "..." },
    "story":       { "status": "...", "reason": "..." },
    "connection":  { "status": "...", "reason": "..." },
    "openClose":   { "status": "...", "reason": "..." }
  },
  "receipts": [ { "t": "00:41", "note": "Three hedges on the claim the talk rests on." } ],
  "fixes": ["What to do first", "Second", "Third"],
  "goal": { "text": "Fillers per minute from 10.2 to under 4", "metric": "fillersPerMinute", "max": 4, "why": "Why this change matters most now." },
  "goalCheck": { "met": false, "note": "Only when the goal to check has no metric: what the recording shows." },
  "eyesOffPercent": 20
}
```

- The nine `scores` are the rubric's nine dimensions, in its order. Red and yellow need the
  moment that shows it (with its `mm:ss`) and the fix.
- `receipts` are the worst moments, each with its timestamp.
- `fixes`: exactly three, highest leverage first, each saying what to do.
- `goal`: one change, the one that most raises the likelihood of the next step, with a number to
  reach. When it is one of the measured numbers, give `metric` (`wpm`, `fillersPerMinute`,
  `pauses`, `longestPauseSeconds`, `runtimeMinutes`) with `max` or `min`, and the next take checks
  it by itself. Otherwise put the number in the text ("eyes on the room in 3 of every 4 frames")
  and the next review judges it in `goalCheck`.

Then:

```
node scripts/report.mjs <talk folder>/rehearsals/take-NN
```

It refuses a review that is missing any of the above and says what, writes `report.md` (the goal
from last time first, then the verdict, the audience's view, the scorecard, the receipts, the
numbers against the last take, the three fixes and the new goal), and appends the take to
`takes.json`. Show the speaker the report, or its top: the goal check, the verdict, the three
fixes and the goal.

From the second take on, say what improved and what is still there.

## 4. After the real talk: the talk log

After the speaker has given the talk, review the recording of the real talk the same way if
there is one, and ask what the feedback said. Then agree **one measurable goal for the next
talk** and add the talk to the talk log, from this skill's folder:

```
node scripts/talk-log.mjs add <talks folder> <talk folder name> --goal "Pause after every key line: at least 5 pauses of 1.5 s or more" --metric pauses --min 5 --notes "What the recording and the feedback showed"
```

The next talk's first rehearsal opens with that goal: `analyse.mjs` finds it, checks it, and the
report puts it first. To see which goal a talk's next rehearsal will check:

```
node scripts/talk-log.mjs goal <talk folder>
```

## 5. Without the tools: the manual checklist

When ffmpeg or Whisper is missing, `analyse.mjs` writes `rehearsals/take-NN/checklist.md`: the
one-page checklist from the rubric, with the talk, the take, the date and the goal from last time
already filled in. Go through it with the speaker while they watch their recording once at normal
speed: ask for each line in turn, a few at a time. Then write `review.json` from their answers
and your judgement of what they describe, and run `report.mjs` on the take folder as above; the
report notes that the numbers were counted by hand.

## Install the tools

Offer these when the tools are missing, and give the speaker **one command at a time**: say what
it does, wait for it to finish, check the output, then give the next. After the last one, open a
new terminal so the PATH change takes effect, and run `analyse.mjs` again.

### macOS

With [Homebrew](https://brew.sh):

1. `brew install ffmpeg` installs ffmpeg and ffprobe.
2. `brew install pipx` installs pipx, which installs Python command-line tools in their own space.
3. `pipx ensurepath` puts pipx's tools on the PATH.
4. `pipx install openai-whisper` installs Whisper.

### Windows

In PowerShell:

1. `winget install --id Gyan.FFmpeg -e` installs ffmpeg and ffprobe.
2. `winget install --id Python.Python.3.12 -e` installs Python, if it is not there yet.
3. `py -m pip install --user pipx` installs pipx.
4. `py -m pipx ensurepath` puts pipx's tools on the PATH.
5. Open a new PowerShell window, then `pipx install openai-whisper` installs Whisper.

### Linux

On Debian or Ubuntu (Fedora: `sudo dnf install ffmpeg-free pipx`; Arch: `sudo pacman -S ffmpeg
python-pipx`):

1. `sudo apt install ffmpeg pipx` installs ffmpeg, ffprobe and pipx.
2. `pipx ensurepath` puts pipx's tools on the PATH.
3. `pipx install openai-whisper` installs Whisper.

To check: `ffmpeg -version` and `whisper --help` each print text instead of "not found".

## The sample

`examples/talks/rehearse-with-your-phone/rehearsal-1.mp4` is a one-minute sample with a known
script; `examples/sample-recording/README.md` has the script, the hand count, and the tolerance
the coach's numbers must stay within. Use it to show a speaker what the coach does before they
record themselves.
