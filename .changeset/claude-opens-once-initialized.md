---
'@kestack/ai-toolkit': patch
---

**Fixed:** Claude Code's `open` now waits until Claude Code has initialized, as Codex's already did. A Harness Binary that exits at once fails the `open` with the reason, instead of failing the first Turn.
