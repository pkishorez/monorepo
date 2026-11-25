# Cut rules

Claude reads this file, `summary-rules.md` and `learnings.md` on every run.
It decides which sentences of a transcript to cut from the short video.
Silences and sounds that are not words (ums, uhs, breaths) are cut by the
code from word timings, before Claude sees anything; they are listed here so
the whole picture of what a short video drops lives in one place.

## What is always removed

- **Silence**: a pause between two words longer than the strength's limit.
  The pause is shortened, not dropped: a little air stays on each side.
- **Fillers**: um, uh, er, ah, hmm, and any sound between words that is not a
  word, such as a breath, a click or a false start the model did not write.
- **Ads**: every stretch where the speaker is selling something that is not
  the video's subject, however smoothly it is woven in. A sponsor read, a
  discount code, "this video is brought to you by", a plug for the creator's
  own course, merch, Patreon or newsletter, and the bridge sentences into and
  out of them ("but first…", "anyway, back to…"). When unsure whether a
  product mention is an ad or part of the subject, keep it.
- **Asks**: "like and subscribe", "hit the bell", "leave a comment", "check
  the link in the description".

## What `normal` also removes

- Greetings and sign-offs that carry nothing: "hey everyone, welcome back",
  "that's it for today, see you next time".
- Housekeeping: audio checks, "can you hear me", scheduling, "let me share my
  screen", apologies for delays.
- Small talk that is not about the subject: weather, travel, how busy they
  have been.
- A point said again in other words when the first saying was clear.
- A tangent that never comes back to the subject.

## What `heavy` also removes

- Anecdotes and examples once the point they illustrate has been made.
- Background the audience of this video already knows.
- Speculation and opinion that adds no fact, step or argument.
- Long introductions of the guest or the plan for the video.

## What is never removed

- A step, fact, number, name, definition, claim or argument the rest of the
  video depends on.
- The first time a point is made.
- A question and its answer, when the answer is kept.
- Anything shown on screen and talked through ("as you can see here…"):
  cutting the talk leaves the picture unexplained.
- Half a sentence: cuts are whole sentences only.

## Strengths

| Strength | Removes                                                                                   | Pause kept at most |
| -------- | ----------------------------------------------------------------------------------------- | ------------------ |
| `light`  | silence, fillers, ads, asks                                                               | 0.8 s              |
| `normal` | `light`, plus greetings, housekeeping, small talk, repeats, dead-end tangents             | 0.5 s              |
| `heavy`  | `normal`, plus anecdotes, known background, opinion without substance, long introductions | 0.3 s              |
