---
'@kestack/ai-toolkit': patch
---

Start over as a local engine for Claude Code and Codex. Every whole record a harness emits is kept as Raw; a pure per-record projection gives one Message form for every agent, including nested subagents and usage. A message sent while a Turn runs steers it once the agent has started that Turn, and is recorded where the agent took it, before its answer; one the agent did not take before the Turn ended starts the next Turn, so no message is lost or run twice. A Turn's status and Fork Point come from how the agent ended that Turn, so a Background Job's result inside it no longer decides either. Projects, Sessions and Turns are Kabuki actors on the server, reached from a WebSocket API (`@kestack/ai-toolkit/api`) with feeds that resume from a cursor, and `@kestack/ai-toolkit/client` gives apps the client and a Replica. The Playground server and RPC are gone.
