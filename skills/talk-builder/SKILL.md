---
name: talk-builder
description: Helps a speaker turn an idea into a talk and its deck, in order - a short talk brief interview (one goal, one desired outcome, one next step, a throughline of at most 15 words, the audience, talk or workshop), a critique of the headlines-only storyboard before anything is built (curse of knowledge, structure, audience fit), a one-time style interview saved as a style file that every later talk reuses, then a slide-by-slide build of an offline html-slides deck with image slides in that style, "AI-generated" labels on photorealistic AI images, speaker notes as cues, and a final story pass; Google Slides instead of HTML on request, through the speaker's Google Workspace CLI. Use when the speaker wants help with a talk, a keynote, a meetup or conference session or a workshop, has a storyboard or an outline to turn into slides, wants their talk's story checked, or wants slides that look like theirs.
license: MIT-0
compatibility: Needs Node.js 22 or later and the html-slides skill from the same plugin next to this one. The deck check needs Google Chrome, Chromium, Edge or Brave. Images come from whatever image tool the agent has; without one the deck is built with placeholders and written prompts. Google Slides, optional, needs the Google Workspace CLI (gws) logged in to the speaker's own Google account.
---

# talk-builder

Takes a speaker from "I have a talk to give" to a deck they can rehearse with, in five gates.
Each gate is cheap to pass and expensive to skip: a talk without a throughline, or a storyboard
nobody questioned, cannot be rescued by pictures.

The method is in this repository's `references/` folder. Read the text named at each step;
this file says when and in what order.

| Gate | Method | Leaves in the talk folder |
|---|---|---|
| 1. Brief | `talk-brief.md` | `talk-brief.md` |
| 2. Storyboard critique | `story.md` (early check), `concision.md` | `storyboard-critique.md` |
| 3. Style, once per speaker | `style-file.md`, `accessibility.md` §1 to §3 | `speaker-style.md` (in the talks folder) |
| 4. Build, slide by slide | `slides.md`, `accessibility.md` §5 (AI labels) | `slides/deck.json`, `slides/images/`, `image-prompts.md` |
| 5. Check and final story pass | `story.md` (final check) | `slides/index.html`, `slides/deck-check.json` |

## The folders

Ask where the speaker keeps their talks. One folder holds them all, and the style file sits
there so every talk inside finds it:

```
talks/
  speaker-style.md            ← written once, read by every talk below
  rehearse-with-your-phone/
    talk-brief.md
    storyboard.md
    storyboard-critique.md
    image-prompts.md
    slides/
      deck.json
      images/
```

`examples/talks/` in this skill is a finished example of exactly this layout.

## 1. The brief, before the storyboard

Run the brief interview **before reading the storyboard**, even when the speaker hands one
over in the first message. Say so: "Before I read your storyboard, five questions, so I can
judge it against what the talk is for." Reading it first anchors the brief to the slides
instead of the room.

Follow `references/talk-brief.md`. Ask the speaker in plain words, a few questions at a time:

1. **The goal:** teach, persuade, inspire or drive action. One primary goal; offer a
   recommendation from what they have said.
2. **The one desired outcome:** what the audience does, thinks or feels differently afterwards.
   If they give three, ask which one matters most.
3. **The one next step:** one action people can take this week.
4. **The throughline:** draft it from the goal and the outcome, one sentence of at most 15
   words, and let the speaker change it.
5. **The audience:** who, how many, what they already know, what they care about, how they
   arrive. Suggest asking the organiser or two attendees rather than guessing.
6. **Talk or workshop**, the slot length and the interaction. Then the room and where the
   companion guide will live.

Ask once more when an answer is vague; never fill a gap with a guess. Write the BRIEF block
from `talk-brief.md` into `<talk>/talk-brief.md`, show it, and let the speaker edit it. Then:

```
node scripts/check-brief.mjs <talk>/talk-brief.md
```

It prints the throughline, or lists what is missing and exits 1. **Do not go on without a
passing brief.** If the speaker cannot state a throughline in 15 words, that is the finding:
help them cut until one sentence holds, or stop here. The build script refuses a talk folder
whose brief fails, so a skipped gate shows up later anyway.

## 2. Critique the storyboard, before building

Now read the storyboard: headlines only, one line per slide, in order. If the speaker has
none, help them write one from the brief first, about one slide per minute for a talk, blocks
with minutes for a workshop. Save it as `<talk>/storyboard.md`.

Run the **early story check** in `references/story.md` against the brief and write
`<talk>/storyboard-critique.md` with these sections, in this order:

```
# Storyboard critique: <title>

Throughline as read: "<the sentence>" (<n> words), and whether the storyboard delivers it.

## Curse of knowledge
One line per finding: slide number and headline, the failure mode (jargon, pace, abstraction,
skipped steps, missing context, assumed buy-in), and the fix. Say "none found" only after
checking every slide against all six.

## Structure
The structure the storyboard has now, the one the goal calls for, the hook, where the strongest
material sits, the close, and whether there is exactly one next step at the end.

## Audience fit
Depth against what this audience knows; why it matters to them, and how early.

## Top fixes
Three to five, ranked: reorder, cut, add, sharpen the hook or the next step.
```

Show the critique, propose the revised storyboard, and get the speaker's yes on it before any
image or slide exists. Append the confirmed storyboard to the critique. Fixing a story here
costs a line; after the build it costs pictures.

## 3. The style interview, once per speaker

```
node scripts/style-file.mjs find <talk>
```

**If it prints a style file, use it and do not ask again.** Say which file you are using and
what it sets (look, colours, image kind, motif). Ask only if the speaker says their taste has
changed; then they edit that file, not a new one.

If there is none, run the style interview once. Ask:

1. **A look they like:** a deck, a website, a photographer, a film, a book cover. Turn the
   answer into a few words for `look`.
2. **Colours:** a background, a text colour, one accent. Offer a dark scheme for dimmable rooms
   and a light one for bright rooms (`accessibility.md` §2), and the colour-blind-safe accents
   (§3) if they have no favourite.
3. **Image kind:** photographs, illustrations, diagrams, or a mix.
4. **A motif:** a recurring object or idea that ties the pictures together. Optional; offer two
   ideas from the talk's subject.
5. **Fonts**, only if they care. A font file they own gets bundled so it works offline.

Write it into the talks folder, not the talk:

```
node scripts/style-file.mjs write <talks folder> look="..." scheme=dark background="#14171c" text="#ffffff" accent="#e69f00" image-kind="..." motif="..." --notes "what to avoid, in their words"
```

It refuses colours whose text falls below 4.5:1 on the background or the panel, and it refuses
to write a second style file where one already applies. Format and keys:
`references/style-file.md`.

## 4. Build, slide by slide

Work through the confirmed storyboard in groups of three to five slides. For each group,
propose a draft and let the speaker edit it; never ask forty separate questions.

For each slide settle, following `references/slides.md`:

- **The sentence:** the slide's one takeaway as a full sentence with a verb, at most two lines.
  Not what the speaker will say, and not a topic label.
- **The slide type** (html-slides): `image` by default; `text` only when the room must read
  a number, code or a comparison of two or three items; `black` for a pause, a question or a
  story; `qr` last, with the companion guide's address.
- **The image:** what picture carries the idea, in the style file's `look`, `image-kind` and
  `motif`. Where the sentence sits (`panel`): over a quiet part of the image.
- **Alt text:** what the image means in this talk, short, never "image of", never the sentence
  again.
- **Speaker notes as cues, not a script:** the story, the number, the question to ask, the
  black-slide moment, in a few words each. Script only the first minute and the last lines.

### Images

Use whatever image tool you have in this session: an image-generation tool, an image model
the speaker has connected, or a command-line tool they have installed. Do not ask the speaker
to sign up for one.

1. Write every prompt into `<talk>/image-prompts.md` first, built from the style file: the
   same frame for every prompt (look, light, motif, empty space where the panel goes, "wide
   16:9 composition"), then the slide's picture. Show the list and get one yes for the batch.
2. Generate, save into `<talk>/slides/images/`, and look at each result: does it carry the
   idea, does it leave room for the sentence, is the motif there? Regenerate what fails.
3. **Mark every AI image** in `deck.json`: `"ai": "photo"` when a reasonable person could take
   it for a real photograph (the slide gets a visible "AI-generated" label), `"ai":
   "illustration"` when it is clearly drawn or stylised (listed in the companion guide's
   colophon instead). When unsure, `"photo"`. Images the speaker made themselves get no `ai`.
4. **No image tool?** Say so, keep the prompts file for the speaker to use elsewhere, and give
   each image slide a `placeholder` instead of an `image`. Keep `"ai": "photo"` on slides whose
   picture will be a photorealistic AI image, so the label is in place when it arrives.

### Write and build

Write `<talk>/slides/deck.json` in the html-slides format (see the html-slides skill's
`SKILL.md`), then build from this skill's folder:

```
node scripts/build-talk.mjs <talk>/slides/deck.json
```

It refuses to build when the talk folder has no passing brief or no storyboard critique with
its "Curse of knowledge" and "Structure" sections, then builds the deck with html-slides in the
speaker's style and prints the throughline.

## 5. Check, then the final story pass

Run the html-slides deck check from the html-slides skill's folder, always:

```
node scripts/check-deck.mjs <talk>/slides
```

Fix and re-run until it prints `Deck check passed`: raise a slide's `dim` or move its panel for
contrast, label every photorealistic AI image, give every image alt text. Exit code 2 means the
check could not run; follow the html-slides skill on that, and never report an unchecked deck as
checked. Then open `index.html` and step through it: the check cannot tell whether a panel
covers the subject of a picture.

Then run the **final story check** in `references/story.md` on the built deck and its notes,
and the over-explaining scan in `references/concision.md` on every sentence and note. Report
every fix and every term you standardised (term → chosen form), and confirm that the
throughline and the one next step survived the build.

## Hand-over

Tell the speaker:

- how to present: copy the `slides/` folder, open `index.html`, press F; it needs no internet;
- what is still a placeholder, and where the prompts are;
- the next steps: three recorded run-throughs (`references/rehearsal-rubric.md`, or the
  `rehearsal-coach` skill), and the companion guide from the same storyboard and notes (the
  `companion-guide` skill).

## Google Slides instead

HTML is the default. Build Google Slides only when the speaker asks for it, for example because
the event wants it. Do it after gate 5, from the same `deck.json` and style file, from this
skill's folder:

```
node scripts/google-slides.mjs <talk>/slides/deck.json
```

It runs the same gates, builds the HTML deck too (the offline fallback), then uses the speaker's
Google Workspace CLI (`gws`) and their own login. It builds the same slides:
full-bleed image slides with the sentence inside the panel shape's own text frame, the
"AI-generated" label on photorealistic AI images, alt text, the sentence-only, black and QR
slides, and the notes in the speaker notes. Google Slides has no blur, so the panel's opacity
goes up where needed to keep 4.5:1; the script names those slides. Pictures must be PNG, JPEG or
GIF.

- **Exit 0:** give the speaker the address it prints. Then look at every PNG it saved in
  `<talk>/slides/google-slides/`, by eye against `accessibility.md` §1: the html-slides check
  does not run on Google Slides. Fix in `deck.json` and run it again; it makes a new
  presentation each time.
- **Exit 3:** Google Slides is not available, because `gws` is missing or not logged in. Tell
  the speaker so in those words, and offer the HTML deck, which is built: check it with
  html-slides as in gate 5 and hand it over. Do not install anything for them unasked. If they
  want Google Slides next time, walk them through `references/google-slides.md` in this skill's
  folder, one command at a time.
- **Exit 1:** a gate failed or Google refused a request; the message says which.
