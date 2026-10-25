# The sample recording

`../talks/rehearse-with-your-phone/rehearsal-1.mp4` is a one-minute rehearsal of the opener of
the talk "Rehearse with your phone", made for testing the coach: a synthetic voice (macOS `say`,
voice Samantha, 165 words per minute) speaking the script below, over a moving test pattern. The
picture is a test pattern, so the frames show nothing about body language; the sound is what the
numbers are measured from. It is released with the rest of the repo under CC0 1.0.

## The script, word for word

The pauses (`[pause 2 s]`) are silences written into the speech.

```
Who here has watched a video of themselves speak? [pause 2 s] Um, most of us never have. And,
uh, I get it. It hurts the first time. But it only hurts once. [pause 1.8 s] So, um, here is the
thing. Your phone is, like, the rehearsal coach you already own. [pause 2 s] You put it at eye
height, you press record, and you, uh, give the whole talk to it. Then you watch it back. Once,
at normal speed. [pause 1.6 s] And you count three things. Um, the filler words per minute. The
pauses after each key line. And, you know, your time against the slot. [pause 1.8 s] I think
three run-throughs are, uh, basically enough. The first one is for comfort. The second one fixes
what the first one showed. The third one is polish. [pause 2 s] So here is your next step.
Record one run-through this week, and watch it once. That's it. Thank you.
```

## The hand count

Counted from the script, which the recording speaks exactly (`hand-count.json`):

| What | Hand count | Measured by the coach |
|---|---|---|
| Words | 145 ("run-throughs" and "That's" are one word each) | 145 |
| Speech | 0:00 to 0:59.3 | 0:00 to 0:59.0 |
| Words per minute | 147 | 147 |
| Fillers | 10: um ×3, uh ×3, like, you know, I think, basically | 10, the same ones |
| Pauses of 1.5 s or more | 6, the six written in | 6 in the saved transcript; 5 or 6 on a fresh run, because the 1.6 s pause lands right at the threshold |

**Stated tolerance:** the coach's words per minute within 5 % of the hand count, its filler total
within 1, its pause count within 1. Whisper can drop or add an "um", and its word timings shift by
a tenth of a second or so around a pause; anything beyond the tolerance is a fault in the coach.
The repo's tests hold the coach to this tolerance.

## The transcript

`whisper-transcript.json` is what Whisper wrote for this recording on 2026-10-25, so the tests can
check the numbers on a machine without Whisper. It came from the same commands `analyse.mjs` runs
(model `small.en`, word timestamps on, the filler prompt), with Whisper's token lists removed and
the timings rounded to the millisecond to keep the file small.
