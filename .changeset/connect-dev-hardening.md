---
'@kestack/connect': patch
---

Connect in development holds up when Apps come and go. A shared Connect decides to stop under the lock, and only when no App leased it meanwhile; its `connect.json` then says it is stopping, so a new App waits for it to go and starts a new one instead of leasing a dying Connect. A pid reused by a later process no longer passes for Connect or for an App's lease, and an App waits at most 10 minutes for a Connect to be ready. Ctrl-C gives an App's lease back only once the App exits. Leases are written whole, and one that does not read yet is not pruned; a stale lock is taken over by one process only. The move from `~/.ai-toolkit` moves the database's WAL before the database and finishes a move cut short; the old Machine is cleared only once `machine.json` holds it; `serve` given its paths never moves `~/.ai-toolkit`, and `ke-connect logout` before a first serve readies the folders as serve would.
