---
'@kestack/ai-toolkit': patch
---

`ai-toolkit serve` says why it stopped when the reason is in the error's cause, such as `listen EADDRINUSE: address already in use 127.0.0.1:4590`, instead of exiting with an empty line.
