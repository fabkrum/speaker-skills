# Accessibility

Rules that let everyone in the room, and everyone who opens the deck or the companion guide
later, follow the talk. The numbers come from WCAG 2.2 unless noted. Evidence key: **✓**
standard or controlled research · **◐** practitioner consensus · **⚠** judgement call.

## 1. Contrast ✓

- **At least 4.5:1 for all text**, including large text (WCAG 2.2, 1.4.3). WCAG allows 3:1 for
  large text on a screen; do not use that allowance on a projected slide, because projector light
  and room light wash contrast out.
- **Measure text over images on the rendered slide**, against the pixels actually behind it.
  This is the case automated checkers miss. On an image slide the text sits on a blurred panel
  (`slides.md` §2); darken or lighten the panel until the lowest-contrast spot behind the text
  still reaches 4.5:1.
- **Non-text elements that carry meaning**, such as chart lines, icons and the QR code, need at
  least 3:1 against their background (WCAG 2.2, 1.4.11).

## 2. Light or dark scheme ⚠

There is no universal winner: people with cataracts tend to read light-on-dark better, people
with astigmatism dark-on-light. Choose by the room:

- **Bright or daylit room:** a light scheme. A dark slide's black washes out to grey.
- **Dimmed room:** a dark scheme is fine and glares less.

Use one consistent scheme across the deck, taken from the speaker's style file, and check it
against §1.

## 3. Never meaning by colour alone ✓

About 1 in 12 men and 1 in 200 women have a colour-vision deficiency; WCAG 2.2 (1.4.1) forbids colour as the only carrier of meaning.

- Add a second channel to every colour that carries meaning: a direct label on each chart
  series instead of a colour legend, a pattern, a shape, an icon, a word.
- **Test:** view the slide in greyscale. If information disappears, it fails.
- **A colour-blind-safe accent palette** (Okabe & Ito 2008; Wong 2011): orange `#E69F00`, sky
  blue `#56B4E9`, bluish green `#009E73`, yellow `#F0E442`, blue `#0072B2`, vermilion `#D55E00`,
  reddish purple `#CC79A7`. Avoid red-green pairs. A speaker's own palette may replace these if
  it still passes the contrast and greyscale tests.

## 4. Size, motion and sound

- **Text size for the back row:** see `slides.md` §5. When unsure, size up.
- **Nothing flashes more than three times per second** (WCAG 2.2, 2.3.1). This is a seizure
  risk and a hard line, including in videos and GIFs on slides.
- **Animate on click, never on a timer**; no auto-advancing slides; at most one animation per
  slide. ◐
- **Caption embedded video.** Where the event offers live captions, tell the room at the start.
- **Say what is on the screen** for anyone who cannot see it: describe the image in a few words
  when it carries the point, and read out the number or code the slide shows.

## 5. Labelling AI-generated images

Since 2 August 2026, the EU AI Act (Article 50(4)) requires people who publish AI-generated or
AI-manipulated images, video or audio that could pass for real to say so. Article 3(60) defines
these "deepfakes": content that resembles real people, objects, places or events and that a
person could mistake for authentic. A talk shown in public and a deck or guide published online
both count. This is a summary, not legal advice.

The rule the skills apply, which is also the honest thing to do outside the EU:

- **Photorealistic AI images carry a visible label on the slide**: the words "AI-generated", in
  a corner of the image, readable from the back row, meeting the contrast rule in §1. Use the EU
  icon next to the words where the speaker has it; the words alone are enough.
  - The question is: could a reasonable person in the room take this for a real photograph?
    If yes, label it. If unsure, label it.
  - **Objects and places count, not only people.** A photorealistic product shot, an invented
    but believable office, a realistic city street all need the label.
  - The label stays on the image in the companion guide too, and in every exported or shared
    version of the deck.
- **Illustrations, diagrams, charts, icons and clearly stylised images get no slide label.**
  Nobody takes them for a photograph. Labelling them anyway teaches people to ignore the label
  where it matters.
- **The companion guide's colophon lists every AI-generated image**, photorealistic or not, with
  the slide it belongs to and the tool that made it. That keeps the guide honest about all of
  them without cluttering the slides.
- **Never remove a label** that came with an image from someone else.
- **AI-edited photos count as well** when the edit adds or changes something that looks real: a
  person added to a crowd, a changed sign, a replaced sky.

## 6. The file itself ✓

Decks and guides get shared, so the file must work with a screen reader:

- **A unique, descriptive title on every slide**; it may be visually hidden, but it must exist.
- **Alt text on every meaningful image**: short, says what the image means in this talk, no
  "image of", does not repeat the slide sentence. Decorative images are marked decorative.
- **Reading order:** the slide sentence first, the slide number last.
- **The language of the deck and the guide is declared** so screen readers pronounce it right.
- **A discreet slide number** on every slide, small and last in reading order.
- **Links say where they go**, and the QR code's address is also written out in the guide.

## Accessibility check

- [ ] 👁 All text reaches 4.5:1, measured on the rendered slide, including over images.
- [ ] Meaningful non-text elements reach 3:1.
- [ ] The scheme suits the room's light.
- [ ] 👁 Every slide survives greyscale; no meaning by colour alone.
- [ ] Nothing flashes more than three times per second; animations run on click.
- [ ] Embedded video is captioned.
- [ ] Every photorealistic AI image carries an "AI-generated" label on the slide and in the guide.
- [ ] The colophon lists every AI-generated image.
- [ ] Every slide has a unique title; every meaningful image has alt text; decorative images are
      marked.
- [ ] Reading order: sentence first, slide number last; document language declared.

## Sources

W3C, *Web Content Accessibility Guidelines (WCAG) 2.2* (2023), success criteria 1.1.1, 1.4.1,
1.4.3, 1.4.11, 2.3.1, 2.4.2, 3.1.1; WebAIM contrast checker; Masataka Okabe & Kei Ito, *Color
Universal Design* (2008); Bang Wong, "Points of view: Color blindness", *Nature Methods* 8 (2011);
Regulation (EU) 2024/1689 (the AI Act), Article 3(60) and Article 50(4).
