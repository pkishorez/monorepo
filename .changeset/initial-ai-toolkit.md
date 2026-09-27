---
'@kstackz/ai-toolkit': patch
---

Initial release under the `@kstackz` scope.

Runs Claude Code and Codex turns on a server and stores every thread, run, and message in a std-toolkit table. A client starts a run over RPC and follows it through the synced table, so long turns survive closed tabs and reconnects. You need it to put coding agents behind your app without tying each turn to one open connection.
