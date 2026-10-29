---
'@kestack/ai-toolkit': patch
---

Claude Code's `open` succeeds only once Claude Code has initialized, as Codex's already did: a Harness Binary that exits at once fails the open, with why, rather than the first Turn.
