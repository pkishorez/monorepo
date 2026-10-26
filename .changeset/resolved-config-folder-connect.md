---
'@kestack/connect': patch
---

Each `HarnessAccountInfo` has `resolvedConfigFolder`, the config folder it really runs with, beside the `configFolder` the user set. A Default Account with none set, on a Machine whose Connect was started with `CLAUDE_CONFIG_DIR` or `CODEX_HOME`, now says that folder, and that the environment chose it, where it said `~/.claude` or `~/.codex`. What runs does not change.
