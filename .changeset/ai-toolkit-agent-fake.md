---
'@kestack/ai-toolkit': patch
---

`@kestack/ai-toolkit/harness/fake` gains `agent`, the Agent fake: Claude Code and Codex installed and signed in on one computer, each reply played from a Script through the harness's own records and its real projection; its one Control, `ReplyWith`, picks the next reply's Script. `agentOver` serves `Harnesses`, `OneShotPrompt`, `HarnessHost` and `Models` over it. Codex's projection no longer pulls in the app-server, so it runs in a browser. `makeFakeHarness` stays for tests.
