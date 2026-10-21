---
'@kestack/ai-toolkit': patch
---

Background Jobs: Claude's background tasks and Codex's background terminals and sub-agents are listed live by the `backgroundJobs` stream, grouped by Session, and `stopBackgroundJob` stops one. They are never stored: they clear when the server stops, and stopping the server now also stops the commands Codex started instead of leaving them running. When a Claude background task ends while the Session is idle, the agent's own Turn is recorded as an Agent-started Turn (`turnStarted.agentStarted`). `mcpStatus` and `contextUsage` report a Session's MCP servers and how full its context is.
