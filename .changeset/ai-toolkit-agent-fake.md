---
'@kestack/ai-toolkit': patch
---

`@kestack/ai-toolkit/harness/fake` gains `agent`, the Agent fake: Claude Code and Codex installed and signed in on one computer, each reply replaying a Turn recorded from the real harness (`RECORDINGS`, captured by the e2e tests), one at random, through its real projection; its one Control, `ReplyWith`, pins one. `agentOver` serves `Harnesses`, `OneShotPrompt`, `HarnessHost` and `Models` over it. Codex's projection no longer pulls in the app-server, so it runs in a browser. `makeFakeHarness` stays for tests.
