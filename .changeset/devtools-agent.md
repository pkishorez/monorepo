---
'@kestack/devtools': patch
---

DevTools has an Agent: any Tool can ask Claude Code about a folder, with only Read, Grep and Glob, and get the answer as text, or as data when it gives a JSON Schema. Questions and their follow-ups make a Thread, one Claude Code session, kept in the server's memory until it stops; a Thread streams its questions, answers, activity lines such as "Reading src/app.ts" and each run's status, and a run can be cancelled. The server answers it at `/rpc/agent`, and runs the `claude` installed on `PATH`; when Claude Code is missing or not signed in, or the folder is gone, the run fails and says why.
