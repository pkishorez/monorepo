---
'@kestack/ai-toolkit': patch
'@kestack/connect': patch
---

A Session's Title is written by its own agent, as its own Harness Account, not always by Codex.

**Changed**

- ai-toolkit: every `Harness` answers One-shot Prompts itself, through `oneShot(text)`, as the `HarnessAccount` it is given. Claude's is new: Claude Code on Haiku, with no tools, no MCP servers, one turn and nothing kept, in a temp folder. Codex's is the one `codexOneShot` gave.
- Connect: a Session's Title, and a Title regenerated, come from the Session's own harness as the Session's Harness Account, so a Claude Session's messages go to Claude only. When that fails, the first Title stays the first line of the message and a regenerated one keeps the Title as it was; no other harness is asked. Before, Codex wrote every Title, so a Connection with no Codex never wrote one.

**Breaking**

- ai-toolkit: `OneShotPrompt` and `codexOneShot` are gone; call `harness.oneShot(text)` with a `HarnessAccount`. A `Harness` must now give `oneShot`, and `makeFakeHarness().layer` gives only `Harnesses`; `promptAccounts` holds the Harness Account each One-shot Prompt ran as.
