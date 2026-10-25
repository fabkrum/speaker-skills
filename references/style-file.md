# The style file

One file per speaker that makes every talk of theirs look like theirs. The style interview
writes it once; the deck and the companion guide read it every time. It lives in the speaker's
project as `speaker-style.md`, in the talk's folder or any folder above it, so one file can
serve every talk in a folder of talks.

## Format

Markdown with a frontmatter block of flat `key: value` lines between two `---` lines. Quote
colours, because `#` starts a comment in YAML. Below the block, free notes in the speaker's
words: what they like, what to avoid, examples.

```
---
look: warm, calm, lots of empty space, one object per picture
scheme: dark
background: "#14171c"
text: "#ffffff"
accent: "#e69f00"
panel: "#14171c"
font: "Atkinson Hyperlegible, system-ui, sans-serif"
font-file: fonts/AtkinsonHyperlegible-Regular.woff2
code-font: "ui-monospace, Menlo, Consolas, monospace"
image-kind: flat illustrations
motif: a paper boat
---

Never stock photos of handshakes. Pictures from the speaker's own travels are welcome.
```

## Keys

| Key | What it sets | Used by |
|---|---|---|
| `look` | the overall feel, in a few words | image prompts, image choice |
| `scheme` | `dark` or `light`, chosen by the room's light (`accessibility.md` §2) | deck, guide |
| `background` | slide and page background, hex | deck, guide |
| `text` | text colour, hex | deck, guide |
| `accent` | one accent colour for numbers, links and lines, hex | deck, guide |
| `panel` | the colour of the blurred panel behind a slide's sentence, hex; defaults to `background` | deck |
| `font` | the font stack for text | deck, guide |
| `font-file` | a font file to bundle, relative to the style file, so the font works offline | deck, guide |
| `code-font` | the font stack for code | deck, guide |
| `image-kind` | photographs, illustrations, diagrams, or a mix | image prompts, image choice |
| `motif` | a recurring object or idea that ties the pictures together | image prompts, image choice |

Every key is optional. Without a style file, or for a key it leaves out, the deck uses a dark
scheme with white text and a colour-blind-safe accent (`accessibility.md` §3).

## Rules

- **Colours must pass the contrast rule** (`accessibility.md` §1): `text` on `background` at
  4.5:1 or more. The deck check measures this on every slide, including text over images.
- **A font the venue laptop lacks falls back** to the next one in the stack. Name a
  `font-file` to bundle it, or end the stack with a system font.
- **One style per speaker, not per talk.** Change it when the speaker's taste changes, not to
  match one event.
