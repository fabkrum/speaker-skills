# Rehearsal rubric

How to rehearse a talk and judge a recording of it, by hand with a phone or measured with
tools. The deck is done; this judges the delivery. Be specific and honest: a timestamped
finding helps the speaker, vague encouragement does not. Praise what is genuinely strong in one
line; spend the rest on what to change.

## 1. Three recorded run-throughs

The speaker rehearses on video, not by re-reading slides: a recording shows what cannot be felt
in the moment. Plan at least three full run-throughs, each recorded and watched back, each with
its own purpose. (Inspired by TJ Walker's video-rehearsal method; see `README.md`.)

1. **Comfort:** get through the material end to end; note where the speaker stalls.
2. **Refine:** fix what the first recording showed; work on the weak spots.
3. **Polish:** consolidate, lock the first minute and the last lines, and lift the energy.

One focus per run-through improves fastest. Each run starts by checking the goal the last one
set (§6).

Practising from the slide images, then from memory of them, makes the speaker independent of
the screen (`slides.md` §7).

## 2. Judge from the audience's seat

Watch the recording as the audience from the brief (`talk-brief.md` §4): their role, what they
know, what they care about, how sceptical they are. Two questions drive the whole review:

1. **Does it land?** Yes, partly or no, and the timestamp where they get lost, bored or stop
   believing.
2. **How likely are they to take the next step, 0 to 10?** People act when the ask is clear,
   they trust the speaker and the benefit to them is obvious. A brilliant delivery with a buried
   or mumbled next step still scores low.

Every technical finding below matters only as far as it changes those two answers. Write the
audience's verdict in their voice: "As a backend developer who has never used this, I…".

## 3. What to measure

Measure, do not judge by feel. With tools, take a word-level transcript with timestamps and
compute these; by hand, count them while watching the recording at normal speed.

- **Runtime against the slot** in the brief: over or under, by how much.
- **Words per minute.** Conversational pace is about 130–160. Above 170 reads as rushing, below
  110 as dragging. Look at the spread, not just the average: rushing the hard part is the tell.
- **Filler rate per minute**, with every timestamp. Two kinds:
  - vocal fillers: um, uh, er, ah
  - hedges: like, you know, sort of, kind of, I think, I guess, maybe, just, basically,
    actually, to be honest, I mean, right?

  More than three or four per minute is noticeable to the audience. Hedges just before a key
  claim cost the most. Automatic transcripts sometimes drop fillers, so listen to the passages
  before calling them out.
- **Pauses.** Count the pauses of 1.5 seconds or more, and note where they fall: after a key line
  (good) or mid-thought as a stall (bad). A talk with none is wall-to-wall talking. A pause
  filled with "um" is the habit to break.
- **Rising endings and fade-outs**: statements that end like questions, and sentences whose end
  disappears.
- **Eyes off the audience**: an estimate of the share of time spent looking at the screen, the
  notes or the floor.
- **Body**, from frames every few seconds or from watching: posture, nervous habits, gestures,
  movement (`delivery.md` §5). Score the first five seconds separately: people judge competence
  within a fraction of a second of seeing someone (Willis & Todorov 2006).

Do not cite the "55 % body language" figure, and do not claim hedges prove incompetence. Hedges
cost clarity and conviction; criticise them on those grounds.

## 4. The rubric

Score each dimension **red, yellow or green**, with a one-line reason, the timestamped evidence
and the fix. Each comes with what good looks like.

| # | Dimension | Green looks like |
|---|---|---|
| 1 | Timing and pace | Within the slot; 130–160 words per minute; slower at the key moments |
| 2 | Fillers and hedges | Under about two per minute; none before key claims |
| 3 | Pauses | A pause after every key line; no filled pauses |
| 4 | Answer first | Each point stated before it is explained; nothing said twice (`concision.md`) |
| 5 | Voice | Varied in pace, volume and tone; statements end falling; no reading aloud |
| 6 | Body and presence | Grounded, open, intentional movement; eyes on the room; a strong first five seconds |
| 7 | Story and message | The throughline is clear; stories carry the numbers; the next step is stated at the end (`story.md`) |
| 8 | Audience connection | "You" and "we" more than "I"; questions to the room; eye contact spread across it |
| 9 | Opening and close | The first minute and the last lines are tight, rehearsed and confident |

## 5. The report

1. **One-line verdict:** would this land with the audience in the brief, and the single biggest
   problem.
2. **The audience's verdict**, in their voice, with "does it land?" and the 0–10 likelihood of
   taking the next step.
3. **Scorecard:** the nine dimensions, each red, yellow or green with a one-line reason.
4. **The receipts:** a timestamped list of the worst moments (`mm:ss`): the filler cluster, the
   moment the speaker reads the slide, the point that took 90 seconds to make.
5. **The numbers:** runtime against the slot, words per minute, fillers per minute, the most
   frequent filler and its count, the longest pause, eyes off the audience.
6. **Top three fixes**, highest leverage first: what to do, not only what is wrong.
7. **One goal for the next rehearsal**: the single change that most raises the likelihood of the
   next step, with a measurable target ("fillers per minute 3.2 → under 2", "next-step
   likelihood 6 → 8") and one line on why it matters most now.

From the second take on, compare with the last one: what improved, and what is still there.

## 6. The take log and the talk log

Improvement only shows if every take is kept.

- **Take log, one per talk:** every rehearsal of this talk, appended, never overwritten: date,
  recording, the numbers from §3, the nine scores, the receipts, the top three fixes and the goal
  for the next take.
- **Talk log, across talks:** one entry per talk given: the talk, the date, what the recording of
  the real talk and the feedback showed, and **one measurable goal for the next talk**.

The first rehearsal of the next talk starts by checking that goal. That is how each talk makes
the speaker better than the last.

## 7. The one-page manual checklist

For a speaker without any tools: record on a phone, watch it back once at normal speed, and fill
this in.

```
REHEARSAL                         Talk: ________________  Take: __  Date: ________

Goal from last time: ___________________________  Met?  yes / no

Runtime: ____ min   Slot: ____ min   Over / under by: ____
Words in one counted minute (pick a middle minute): ____   (aim 130–160)
Fillers in that minute: ____   Most frequent: ______________
Key lines followed by a real pause:   all / some / none
Eyes on the room (not screen, notes, floor):   mostly / half / rarely
Nervous habit spotted: ______________________   at mm:ss ______

Would the audience in the brief get the throughline?   yes / partly / no
How likely are they to take the next step (0–10)?   ____

Worst moment (mm:ss and what): ________________________________________
Top three fixes:
  1. ____________________________________________
  2. ____________________________________________
  3. ____________________________________________
Goal for next time (measurable): ______________________________________
```

## Sources

Janine Willis & Alexander Todorov, "First impressions: making up your mind after a 100-ms
exposure to a face", *Psychological Science* 17 (2006). The three purposeful video run-throughs
are inspired by TJ Walker's course on public speaking.
