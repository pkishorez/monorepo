---
'@kestack/ai-toolkit': patch
---

A Codex `usage` counts its input as Claude Code's does.

**Fixed**

- Codex counts what it read from and wrote to the cache inside its input, so its `inputTokens` came out larger than Claude Code's for the same work, and a sum of input and cache read counted the cache twice. A Codex `usage` now gives only what was sent fresh as `inputTokens`, with `cacheReadTokens` and, when there are any, `cacheWriteTokens` apart. `UsageSchema` says what each field means. `PROJECTION_VERSION` is 8.
