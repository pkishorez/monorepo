---
'@kestack/ai-toolkit': patch
---

Start over as a local engine for Claude Code and Codex. Every whole record a harness emits is kept as Raw; a pure per-record projection gives one Message form for every agent, including nested subagents and usage. Projects, Sessions and Turns are Kabuki actors on the server, reached from a WebSocket API (`@kestack/ai-toolkit/api`) with feeds that resume from a cursor, and `@kestack/ai-toolkit/client` gives apps the client and a Replica. The Playground server and RPC are gone.
