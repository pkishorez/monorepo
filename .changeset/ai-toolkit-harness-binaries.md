---
'@kestack/ai-toolkit': patch
---

Each harness can run as a chosen program: `harnessBinaries` lists the path, version and any error for Claude and Codex, and `setHarnessBinary { harness, path }` sets one (null goes back to the default) after checking it runs with `--version`, or fails with `InvalidBinary`. New agent processes use it. `harnesses` now says whether each agent is `available`, and why not.

Breaking, for code that builds on the engine or harnesses directly: `Engine.layer` is a function taking `{ attachments }`, the folder for saved files; `Titler.title` takes the user messages to title from, not one text; and a `HarnessSession`'s `turn` and `steer` take a `TurnInput` (`{ text, images, model?, settings? }`) instead of a string. A turn's stream now carries `TurnOut`: the agent's records, a `TurnSteered` where the agent took each steer, and a closing `TurnEnd { status, error?, forkPoint?, shown }` (ADR 0013); `isRecord` tells records apart. `turn(input)` and each of `agentTurns` give a `TurnHandle` `{ out, steer }`; `HarnessSession.steer` is gone. A handle's `steer(id, input)` takes the engine's id for the steer, joins only that turn once it has started, and is refused once it has ended or while the agent runs another. `lastTurnNativeId` is gone: each turn's Fork Point is in its `TurnEnd`.
