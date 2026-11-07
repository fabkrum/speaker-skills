# Image slides

The rules for building the slides. Evidence key: **✓** controlled studies or replicated
cognitive science · **◐** strong practitioner consensus · **⚠** authorities disagree, use
judgement.

## 0. The one principle

**The speaker is the presentation; the slides support them.** Good slides mean little without
the narration, so the room has to listen (Reynolds, *Presentation Zen*). Proof, explanation and
emotion come from the speaker's voice; the screen supplies an image that makes the words stick.
A slide that tries to be a document and a visual aid at once serves neither. Detail that people
need to keep goes into the companion guide, not onto a denser slide. ◐

## 1. Why images, not words ✓

- **Two channels, each limited** (Mayer & Moreno 2003; Paivio's dual coding): heard words and
  seen images travel separate, limited channels. Text on screen competes with the image for the
  visual channel.
- **Redundancy:** an image plus narration beats an image plus narration plus the same words on
  screen. Putting the spoken sentences on the slide overloads the eyes (Mayer, *Multimedia
  Learning*).
- **Coherence:** removing interesting but irrelevant material, such as decorative images, logos
  and background graphics, improves learning.
- **Pictures are remembered better than words** once more than a few seconds have passed. The
  speaker's voice and one strong image are what survive the week.

So words go to the voice and the screen gets images. The honest exceptions are below in §3.

## 2. The default slide: one image, one sentence

Every content slide is a **full-bleed image with one sentence on a blurred panel**.

- **The image fills the slide**, edge to edge. It is the one dominant visual and carries the
  idea; it is not decoration.
- **The sentence states the takeaway** as a full declarative sentence: a subject, a verb and a
  claim, not a topic label. "Caching cuts the first load in half", not "Caching". It is short
  enough to read in a glance, ideally one line and never more than two.
- **The panel sits behind the sentence**: a strip of the image itself, blurred and darkened or
  lightened, so the text reaches at least 4.5:1 contrast against it (`accessibility.md` §1).
  The blur keeps the image whole and readable as a picture while giving the text a calm
  background.
- **Place the panel where the image is quiet**, never over the subject.
- **Nothing else on the slide** except a discreet slide number and, where it applies, the
  AI-generated label (`accessibility.md` §5).

**Why a sentence and not bullets** ✓: audiences who see a sentence headline plus visual
evidence understand and remember more than audiences who see a topic title and bullets, with
the largest gains on complex ideas; more text on the slide did not improve recall (Alley &
Neeley 2005; Garner & Alley 2013). ⚠ Most of these studies come from the method's creators and
mix several changes at once, so which element drives the gain is debated. The advantage itself
is robust; use it as a default, not dogma.

**A question can stand in for the sentence.** On a teaching slide the speaker may show a
question the room wants answered and that is easy for them to answer, then answer it aloud. The
question cues the speaker's memory and the room's curiosity at once; the answer can follow on a
click as the takeaway sentence. Over many rehearsals the speaker will find they no longer need
the slide to remember what comes next. (Inspired by Andy Harrington's material; see
`README.md`.)

## 3. When words on screen are justified

Words go on the screen only when the audience has to **read** something, not hear it:

- **A number** the room should keep, such as a key statistic. Numbers are recalled better seen
  than heard ✓. Show the number large; let the speaker supply the relatable comparison
  (`story.md` §4).
- **Code** or a command the room will type or must read exactly.
- **A comparison**: two or three things side by side, a before and after, a small table whose
  point is the contrast.

For these, use the **sentence-only variant**: no photo, a plain background from the style file,
and the number, code or comparison as the dominant element. Even here, keep it to what the room
must read: one number, the few lines of code that matter, two or three columns. Label each part
directly on the thing it describes, not in a separate legend ✓ (spatial contiguity).

Everything else the speaker says. Dense tables, long code and references go into the companion
guide.

## 4. The images

- **One idea per image, as large as possible.** Edge to edge beats a small image beside text.
- **Size shows importance** (Phillips, "How to avoid death by PowerPoint", TEDxStockholmSalon
  2014): the most important element is the biggest thing on the slide. ◐
- **Few objects:** the fewer separate elements, the faster the slide reads. Treat "about six at
  most" as a practical heuristic, not a law of memory. ◐
- **Delete what carries no meaning**: logos, gradients, shadows, stock photos that only fill
  space. ✓ (coherence)
- **One style across the deck**, taken from the speaker's style file: the same image kind
  (photo, illustration, 3D), the same colours and the same motif, so the deck reads as one.
- **Every slide reads in under three seconds.** If it does not, remove something.
- **Photorealistic AI images carry an "AI-generated" label on the slide** (`accessibility.md` §5).

## 5. Type and colour

**Type** ◐: a sans-serif in medium weight or heavier; thin weights vanish in projector light.
On a 16:9 slide at 1920 px wide, set the panel sentence at 48 px or more and the
sentence-only variant's main element larger still; 36 px is the floor for anything the room
must read. The rule behind the numbers: the back row should be no more than eight screen
heights away, and text should be at least 1/50 of the screen height. When unsure, size up. No
all-caps sentences, no underlines.

**Colour:** follow `accessibility.md` §1–§2: at least 4.5:1 on all text, a scheme chosen by
the room's light, and never meaning by colour alone.

## 6. Keep the eyes on the speaker ◐

- **The black slide is the strongest tool.** Pressing **B** blacks the screen and the room looks
  back at the speaker. Use it for the opening, stories, key arguments and Q&A.
- **Reveal one element at a time, on click**, never on a timer, so the screen never runs ahead of
  the voice.
- **Steer the eye with contrast**: dim what is not being discussed, keep full contrast on the one
  thing that is.
- **Rest slides**, a full image or black, between sections let the deck breathe.
- **Some moments need no slide**: the opening, the close, personal stories, a single big
  question, a live demo.

## 7. Speaker notes are cues, not a script

- **Notes hold triggers, not sentences:** a few words per point, the number, the story's name,
  where to pause. Full sentences in the notes turn into reading aloud.
- **Name the mental image** for each slide: a concrete picture that brings the point back. The
  speaker practises with the slide, then picturing it, until recall is automatic. The slide image
  is the outside version of the same anchor. (Inspired by Andy Harrington's material.)
- **Script only the first minute and the last lines** (`story.md` §6).
- **Mark the black-slide moments**, the reveals, and flex points where the speaker can go deeper
  or skip depending on the room (`delivery.md` §2).

## 8. The special slides

- **Title slide:** the talk's title, the speaker's name, and the promise of the companion guide.
- **The last slide:** the one next step in one sentence, and a QR code with the address of the
  companion guide, large enough to scan from the back row. Leave it up during Q&A.
- **A discreet slide number** on every slide, small and out of the way: it helps in Q&A
  ("slide 14") and in the shared file.

## Build check

Run before the deck is shared. Check items marked 👁 on the rendered slide, not in the source.

- [ ] One idea per slide; every content slide is one image and one sentence.
- [ ] Each sentence states a takeaway, with a verb, in at most two lines.
- [ ] Words beyond the sentence appear only for a number, code or a comparison.
- [ ] Nothing on screen repeats what the speaker will say.
- [ ] 👁 Each slide reads in under three seconds.
- [ ] 👁 Panel text reaches 4.5:1 against the blurred panel, measured on the rendered slide.
- [ ] 👁 No text overflows, is clipped, or sits over the image's subject.
- [ ] Every photorealistic AI image carries the "AI-generated" label.
- [ ] All `accessibility.md` checks pass.
- [ ] Notes are cues; the first minute and last lines are scripted; black slides are marked.
- [ ] The last slide shows the next step and a QR code that opens the companion guide.

## Sources

Garr Reynolds, *Presentation Zen* (2008); Richard Mayer, *Multimedia Learning* (2nd ed., 2009)
and *The Cambridge Handbook of Multimedia Learning* (2014); Mayer & Moreno, "Nine ways to reduce
cognitive load in multimedia learning", *Educational Psychologist* 38 (2003); Allan Paivio,
*Mental Representations: A Dual Coding Approach* (1986); Michael Alley & Kathryn Neeley,
"Rethinking the design of presentation slides", *Technical Communication* 52 (2005); Joanna
Garner & Michael Alley, "How the design of presentation slides affects audience comprehension",
*International Journal of Engineering Education* 29 (2013); David JP Phillips, "How to avoid
death by PowerPoint" (TEDxStockholmSalon, 2014); the Presentation Guild's 8H rule.
