---
'@kestack/ai-toolkit': patch
'@kestack/connect': patch
---

A Dictation can be heard while it is recorded, as a Take: its audio goes in numbered stretches and its text comes back as it goes.

**Added**

- `Speech` has `watchTake`, `addTakeAudio` and `endTake`. A Take switches Speech to Text on if it is off, says how far the model has downloaded meanwhile, keeps the audio, and transcribes only what is not yet settled, cutting a long tail at its quietest moment, and lets go of the audio before the cut. A stretch sent again is ignored, so a sender that lost track, as after a restart, sends them all again. A Take watched is never dropped, however long its model downloads; one nobody watches or touches for 10 minutes is. One dropped or broken before it is Done fails whoever watches it. Calls that reach a new Take together start one.
- The code Plugin's API has the same three calls, and `TakeHeard`: `Downloading`, `Heard` or `Done`.
