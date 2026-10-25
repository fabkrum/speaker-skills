---
name: companion-guide
description: Writes the companion guide people get after a talk, from the speaker's storyboard and speaker notes (or their html-slides deck) - one HTML file with one section per slide that names and explains the slide's concept beside its picture, a "Your next step" block with the talk's one action for this week and how to do it, further reading below it, and a colophon listing every AI-generated image, in the speaker's own style - then checks it in a real browser (one section per slide in order, the next step, the colophon, no sideways scroll at 390 px, readable text, alt text) and shows how to publish it free on GitHub Pages with its QR code on the last slide. Use when the speaker wants a companion guide, a handout, a write-up or a "read more" page for a talk or workshop, wants people to remember what the slides meant, or needs the link for the last slide.
license: MIT-0
compatibility: Needs Node.js 22 or later and the html-slides skill from the same plugin next to this one. The check needs Google Chrome, Chromium, Edge or Brave (or CHROME_PATH pointing to one). The finished guide opens in any browser.
---

# companion-guide

A talk is a spark: a week later people remember the pictures and forget what they meant. The
companion guide keeps the meaning. It explains each slide's concept in text, in the order of the
talk, and ends with the talk's **one next step** and how to take it. The speaker promises it in
the first minute and shows its QR code on the last slide, so the room listens instead of taking
notes.

The method is in this repository's `references/` folder: `story.md` §5 (one next step),
`concision.md` (say it once, answer first), `accessibility.md` §5 (AI labels and the colophon)
and §6 (the file itself), and `style-file.md`. This file covers how to write and build the
guide.

## What the reader gets

One `index.html`, every image and font inside it, nothing loaded from elsewhere:

1. The talk's title, the speaker and the event, one or two lines on how to use the guide, and a
   contents list.
2. **One section per storyboard slide, in order:** the slide number, the concept as a heading,
   the slide's picture (with its "AI-generated" label if it is a photorealistic AI image), the
   slide's sentence, and the explanation.
3. **Your next step:** the one action, why it is worth it, and how to do it, step by step.
4. **Further reading**, for those who want more.
5. **The colophon:** every AI-generated image, with its slide and the tool that made it.

It reads on a phone at 390 px with no sideways scroll and body text of 18 px.

## 1. Gather the talk

Read, from the speaker's talk folder (if the storyboard came in the conversation, save it as
`<talk>/storyboard.md` first, one numbered line per slide, in order):

- the **storyboard**, one line per slide, final order;
- the **speaker notes**: the stories, numbers and examples behind each slide;
- `talk-brief.md` if there is one: the throughline, the audience, and the **next step**;
- the deck: if it is an html-slides deck, its `deck.json` holds the sentence, image, alt text,
  AI marking and notes of every slide, and the guide reads them from there.

Find the **one next step**: the brief's "Next step", the last slide, or the last lines of the
notes. If they disagree, or there are several asks, ask the speaker which one; never pick one
silently. The guide and the last slide must say the same thing.

For every AI-generated image, find out which tool made it. If nobody knows, ask; the colophon
needs it.

## 2. Write the guide, slide by slide

Make a `guide/` folder in the talk folder and write `guide/guide.json`. With an html-slides
deck:

```json
{
  "title": "Rehearse with your phone",
  "speaker": "Sam Example",
  "event": "Example Meetup, 12 November 2026",
  "url": "https://example.github.io/rehearse-with-your-phone/",
  "deck": "../slides/deck.json",
  "aiTool": "an image model, from a written prompt",
  "intro": "Everything from the talk, one section per slide. Your next step is at the end.",
  "sections": [
    { "concept": "The phone as rehearsal coach",
      "body": ["You cannot hear yourself while you speak...", "Put the phone where the back row would sit..."] }
  ],
  "nextStep": {
    "action": "Record one run-through of your next talk this week and watch it back once.",
    "why": "One recording shows you more than ten silent read-throughs.",
    "how": ["Prop your phone at eye height.", "Give the whole talk once.", "Watch it back the same day."]
  },
  "furtherReading": [
    { "title": "Whisper", "url": "https://github.com/openai/whisper", "note": "free speech-to-text on your own laptop" }
  ]
}
```

- `sections`: **exactly one per slide, in the deck's order**, black and QR slides included.
  The builder refuses any other count. The slide's sentence, image, alt text and AI marking
  come from the deck; to change them, change the deck and build both again.
- `concept`: the idea the slide's picture stands for, as a short name a reader could look up
  again: "Three run-throughs, one purpose each", not "Slide 3" or the sentence repeated.
- `body`: one to three short paragraphs, about 60 to 150 words in all. Say what the concept is,
  why it matters to this audience, and what to do with it (what / so what / now what). Use the
  story or the number from the notes; the guide is where detail cut from the slides goes. Spell
  out every acronym and term the audience from the brief may not know (the curse-of-knowledge
  modes in `story.md` §2). Say each thing once. Write `code` in backticks and links as
  `[text](https://...)`.
- A **black slide's** section explains the moment: the question asked, the story told, and
  what the reader takes from it. Give the black slide a `title` in the deck, so its section
  has a line to show.
- The **QR slide's** section is short: what the guide is, and that the next step follows.
- `nextStep.action`: the one action, this week, as one sentence. `how`: three to six concrete
  steps, each one thing to do, enough that someone who missed the talk could do it. `why`:
  one line on what it gets them (optional).
- `furtherReading`: two to five sources the speaker named or the method's references cite.
  Only addresses you have seen work; never invent a link.
- `aiTool`: the tool that made the AI images, once for the guide; a section can set its own
  `aiTool` when one image came from another tool.
- `url`: the guide's own address (see step 5); the builder warns when the deck's QR slide
  points elsewhere.

**Without an html-slides deck** (a Google Slides or PowerPoint talk), leave `deck` out and give
each section its slide's own `sentence`, and `image`, `alt` and `ai` when it has a picture,
with the image saved next to `guide.json`. Mark AI images as the deck would: `"photo"` for
anything a reasonable person could take for a real photograph (it gets the label),
`"illustration"` for clearly drawn or stylised ones (colophon only).

Draft a few sections at a time, show them, and let the speaker change them. The guide speaks
in the speaker's voice: first person where the notes tell their stories, plain words, short
sentences.

## 3. Build

From this skill's folder:

```
node scripts/build-guide.mjs <talk>/guide/guide.json
```

It writes `<talk>/guide/index.html` in the speaker's style file (found in the guide's folder
or any folder above, or `--style <file>`), with the images and the style file's font inlined.
It stops with a plain message when a section is missing or extra, a concept or explanation is
empty, the next step is not one action with steps, further reading is missing, or an AI image
has no tool. It prints the file's size; above 5 MB, save the images about 1280 px wide as JPEG
or WebP, point the deck at them, and build again.

## 4. Check

Run the guide check, always, before calling it done:

```
node scripts/check-guide.mjs <talk>/guide
```

It reads the deck named in `guide.json`; without a deck, pass the storyboard:
`--storyboard <talk>/storyboard.md` (its numbered lines are the slides). It opens the guide in
headless Chrome on a 390 px wide phone and fails when:

- there is not exactly one section per slide, numbered in order, each with its concept and an
  explanation, and (with a deck) each showing its own slide's sentence;
- there is no "Your next step" block with exactly one action after the sections, or
  "Further reading" does not come after it;
- an AI-generated image, in the guide or in the deck, is missing from the colophon, or a
  photorealistic one has no visible "AI-generated" label;
- an image has no alt text or does not load;
- anything sticks out sideways (horizontal scroll), body text is under 16 px, or text reaches
  less than 4.5:1 against its background;
- the page loads anything from the network.

It prints one line per problem and writes `guide-check.json` next to `index.html`. Fix the
cause in `guide.json`, the deck or the style file, build again and re-check until it prints
`Guide check passed`.

Exit code 2 means the check could not run, which is not a pass: no browser was found (tell the
speaker to install Google Chrome or set `CHROME_PATH`), the browser could not start because
your shell runs in a sandbox that blocks it (run the same command outside the sandbox if your
tool lets you, or give the speaker the one command to run), or there was no deck or storyboard
to compare with. Never report an unchecked guide as checked.

Then **read it as someone who missed the talk.** Open `index.html` and read every section with
only the brief's audience in mind: could they follow it, and would they know exactly what to
do this week? The check cannot judge that.

## 5. Publish, and put the QR code on the last slide

Follow `references/github-pages.md` in this skill: one public repository per talk, the one
`index.html` uploaded, Pages switched on. Offer the browser steps to speakers who do not use a
command line, and give them one step at a time. The address,
`https://<username>.github.io/<repository>/`, is known before publishing, so:

1. Set it as `url` in `guide.json` and in the deck's `qr` slide, build both, and run the deck
   check and the guide check.
2. Publish, open the address on a phone, and scan the QR code on the slide: it must open the
   guide.

## Hand-over

Tell the speaker:

- where the guide is and its address, and that it is one file they can also send by email;
- to promise it in the first minute ("everything is in a guide, the link comes at the end")
  and to end on the last slide, saying the one next step again;
- after the talk, to add the answers to questions they could not answer on stage
  (`delivery.md` §7), and build and publish again: the address stays the same.

## Sample

`examples/talk/` is a talk folder with a style file, a six-slide html-slides deck and its
`guide/guide.json`. Build and check it:

```
node scripts/build-guide.mjs examples/talk/guide/guide.json
node scripts/check-guide.mjs examples/talk/guide
```
