---
'@kestack/ai-toolkit': patch
---

The model picker lists only the models this machine's login can run: Codex asks `codex app-server` (`model/list`) and Claude asks Claude Code (`supportedModels()`), each filled in from models.dev and cached for a few minutes; models.dev's list is the fallback when the login cannot be asked. `harnesses` returns the login's default model. Harnesses gain an optional `availableModels`. A Codex turn the provider rejects ends with the provider's message instead of its raw JSON.
