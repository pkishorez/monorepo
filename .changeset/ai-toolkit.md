---
'@kestack/ai-toolkit': patch
---

ai-toolkit is now the harness and nothing more: its doors are `contract`, `harness`, `harness/fake`, `speech` and `speech/fake`.

- Breaking: the engine, the Machine, its CLI and the `api`, `client`, `server` and `machines` doors move to `@kestack/connect`.
- An Agent is plain Effects (`HarnessSession` is `Agent`, `Titler` is `OneShotPrompt`), with forks, asks, steers, attachments, Skills, Background Jobs and per-login model lists.
- Text and reasoning stream in sentence-sized chunks, and Claude runs the Claude Code installed on PATH when there is one.
- Speech to Text runs Parakeet on the Machine, downloaded from Hugging Face.
