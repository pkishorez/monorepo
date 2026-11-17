---
'@kestack/ai-toolkit': patch
---

A Claude session runs Claude Code's own system prompt, unless its settings ask for the Agent SDK's minimal one.

**Changed**

- With no `systemPrompt` option, the Agent SDK gives Claude Code its minimal prompt, which covers only tool calling, unlike `claude -p`. Claude now opens every session with Claude Code's own prompt, its coding, tool and safety guidance included. A Session's settings may say `systemPrompt: 'minimal'` for the SDK's prompt as before; missing or unknown, it is Claude Code's. It is set as the session opens, and no Setting a picker offers: Claude Code records the prompt on a session's first request and keeps it until compaction.
