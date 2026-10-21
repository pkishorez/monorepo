---
'@kestack/ai-toolkit': patch
---

Each harness can run as a chosen program: `harnessBinaries` lists the path, version and any error for Claude and Codex, and `setHarnessBinary { harness, path }` sets one (null goes back to the default) after checking it runs with `--version`, or fails with `InvalidBinary`. New agent processes use it. `harnesses` now says whether each agent is `available`, and why not.

Breaking, for code that builds on the engine or harnesses directly: `Engine.layer` is a function taking `{ attachments }`, the folder for saved files; `Titler.title` takes the user messages to title from, not one text; and a `HarnessSession`'s `turn` and `steer` take a `TurnInput` (`{ text, images, model?, settings? }`) instead of a string.
