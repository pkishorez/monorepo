---
'@kestack/ai-toolkit': patch
---

`@kestack/ai-toolkit/harness/fake` gains `agent`, the Agent fake: Claude Code and Codex as one computer has them (installed, logins, binaries, config folders, Skills, models), each reply played from a Script through the harness's own records and its real projection, with Controls for a running reply (ask, fail, cut off, hang), Background Jobs, Agent-started Turns, Titles and Btw answers. `agentOver` serves `Harnesses`, `OneShotPrompt`, `HarnessHost` and `Models` over it. Codex's projection no longer pulls in the app-server, so it runs in a browser. `makeFakeHarness` stays for tests.
