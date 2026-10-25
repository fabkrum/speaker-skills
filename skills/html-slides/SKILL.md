---
name: html-slides
description: Builds a talk's slide deck as one self-contained HTML folder that runs offline in any browser on any venue laptop - full-bleed image slides with one sentence on a blurred panel, a sentence-only slide for a number, code or a comparison, a black slide, and a QR slide for the companion guide - then checks it in a real browser (text contrast at least 4.5:1 against the image, AI-generated labels, alt text, no sideways scroll on a phone, nothing loaded from the network). Use when the speaker wants slides, a deck or a presentation built from a storyboard, wants an existing deck checked, or asks for slides that need no account, no internet and no PowerPoint.
license: MIT-0
compatibility: Needs Node.js 22 or later. The check needs Google Chrome, Chromium, Edge or Brave (or CHROME_PATH pointing to one). The finished deck runs in Chrome, Firefox and Safari without either.
---

# html-slides

Turns a storyboard into a deck the speaker can carry on a USB stick: one folder, one
`index.html`, every file inside it, nothing loaded from the internet. Then proves it works
with the deck check, in a real browser.

The method behind the slides is in this repository's `references/` folder: `slides.md` (image
slides, when words are justified, the black slide) and `accessibility.md` (contrast, alt text,
AI labels). Follow them; this file covers how to build.

## What the speaker gets

| Slide | For | What is on it |
|---|---|---|
| `image` | every content slide (the default) | a full-bleed image and one sentence on a blurred panel |
| `text` | a number, code or a comparison the room must read | the sentence plus one `figure`, `code` or `compare` (2 to 3 items) |
| `black` | a pause, a question, a story with no picture | nothing |
| `qr` | the last slide | the sentence, the companion guide's address and its QR code |

Every slide gets a small slide number; notes stay in the file and never show. In the browser:
→ or Space moves on, ← goes back, **B** (or a clicker's black-screen key) blacks the screen,
**F** goes full screen, Home and End jump. The address keeps the slide (`#7`), so a reload
stays put.

## Build

1. **Read the speaker's style file** (`speaker-style.md`, format in `references/style-file.md`).
   The builder finds it in the deck's folder or any folder above; if it lives elsewhere, pass
   `--style <file>`. Without one the deck uses a dark default; say so, and suggest the style
   interview before the next deck.

2. **Make the deck folder** where the speaker keeps the talk, for example `slides/`, with an
   `images/` folder inside. Copy each slide's image there.

3. **Write `deck.json`** in that folder, one entry per storyboard slide, in order:

   ```json
   {
     "title": "Record, watch, fix one thing",
     "lang": "en",
     "slides": [
       { "type": "image", "image": "images/stand.jpg", "alt": "A phone on a stand, recording an empty stage",
         "sentence": "Your phone is the only rehearsal coach you need.",
         "ai": "photo", "panel": "bottom-left", "notes": "Hook: who has watched themselves speak?" },
       { "type": "text", "sentence": "Three run-throughs are enough to hear the difference.", "figure": "3" },
       { "type": "black", "notes": "Ask the room. Wait." },
       { "type": "qr", "sentence": "Everything from this talk is in the guide.", "url": "https://example.com/guide" }
     ]
   }
   ```

   - `sentence`: the slide's one takeaway, a full sentence with a verb, at most two lines.
   - `alt`: what the image means in this talk, short, never "image of", never the sentence again.
   - `ai`: `"photo"` for an AI image a reasonable person could take for a real photograph (it
     gets the visible "AI-generated" label), `"illustration"` for a clearly drawn or stylised AI
     image (no slide label; the companion guide's colophon lists it). Leave it out for images
     no AI made. When unsure whether an image passes for real, use `"photo"`.
   - `panel`: where the sentence sits, over a quiet part of the image, never over its subject:
     `bottom-left` (default), `bottom`, `bottom-right`, `top-left`, `top`, `top-right`.
   - `dim`: the panel's opacity from 0 to 1 (default 0.62). Raise it when the check reports low
     contrast.
   - `notes`: cues, not a script. Mark black-slide moments and reveals here.
   - No image yet? Leave `image` out and give `placeholder` a description: the builder draws a
     placeholder so the speaker can rehearse the flow before the pictures exist.

4. **Build** from this skill's folder:

   ```
   node scripts/build-deck.mjs <deck folder>/deck.json
   ```

   It writes `index.html` and a `deck/` folder (layout, navigation, the bundled QR library) next
   to `deck.json`, and stops with a plain message when a slide misses its sentence, its alt
   text or its address.

5. **Check** the built deck, always, before calling it done:

   ```
   node scripts/check-deck.mjs <deck folder>
   ```

   It opens the deck in headless Chrome, shows every slide and fails when:
   - a slide's text reaches less than 4.5:1 against the pixels behind it, measured on the
     rendered slide at the worst spot under the text;
   - a slide with an `ai: "photo"` image has no visible, readable "AI-generated" label;
   - an image has no alt text or does not load;
   - anything sticks out sideways on a 390 px wide phone;
   - the deck loads anything from the network;
   - the QR slide has no QR code.

   It prints one line per problem and writes `deck-check.json` next to `index.html`. Fix and
   re-run until it prints `Deck check passed`. For contrast: raise `dim`, or move the panel to a
   calmer part of the image.

   Exit code 2 means the check could not run, which is not a pass. Either no browser was found
   (tell the speaker to install Google Chrome or set `CHROME_PATH`), or the browser could not
   start because your shell runs in a sandbox that blocks it. Then run the same command again
   outside the sandbox if your tool lets you (in Claude Code, the Bash tool's sandbox override;
   the speaker approves it), or give the speaker the one command to run themselves. Never report
   an unchecked deck as checked.

6. **Look at it.** The check cannot judge whether a panel covers the image's subject or whether
   the image carries the idea. Open `index.html`, step through every slide, and fix what reads
   badly.

7. **Tell the speaker** how to present: copy the whole folder, open `index.html` in any browser,
   press F. It needs no internet, so venue Wi-Fi does not matter.

## Editing by hand

Change `deck.json` and build again rather than editing `index.html`: the builder escapes text,
places the AI label and keeps the structure the check relies on. If the speaker edits
`index.html` directly, keep `section.slide` inside `main.deck`, put images in `<img alt>` (an
image drawn with CSS fails the check, it cannot carry alt text), keep `data-ai="photo"` and the
`AI-generated` label together, and run the check again.

## Sample

`examples/sample/` holds a six-slide deck with every slide type and a style file. Build and
check it to see the result:

```
node scripts/build-deck.mjs examples/sample/deck.json
node scripts/check-deck.mjs examples/sample
```
