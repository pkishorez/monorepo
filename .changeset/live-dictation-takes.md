---
'@kestack/ai-toolkit': patch
'@kestack/connect': patch
---

A Dictation can be heard while it is recorded, as a Take: its audio goes in numbered stretches and its text comes back as it goes.

**Added**

- `Speech` has `watchTake`, `addTakeAudio` and `endTake`. A Take switches Speech to Text on if it is off, says how far the model has downloaded meanwhile, keeps the audio, and transcribes only what is not yet settled, cutting a long tail at its quietest moment.
- The code Plugin's API has the same three calls, and `TakeHeard`: `Downloading`, `Heard` or `Done`.
