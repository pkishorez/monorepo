---
'@kestack/ai-toolkit': patch
---

`configFolderOf` says which config folder a Harness Account really uses, as `ConfigFolderInfo`: its own; else, with none, `CLAUDE_CONFIG_DIR` or `CODEX_HOME` from the environment it runs in; else `~/.claude` or `~/.codex`. What runs does not change.
