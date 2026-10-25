Moved from toolkits/ai-toolkit/docs/adr/0018

# An app is on every Machine at once, and each Instance owns its connection

Status: accepted.

An app holds one `CodeReplica` Instance for every Machine in the signed-in User's Machine List, and each Instance syncs through its own Machine's socket, found by its key, the Machine id. Queries read across every Instance, and each row says which Machine it came from, as the Replica glossary already allows. Nothing in the app is inside one Machine: only a Session's address names its Machine. The Machine list itself always comes from Cloud Connect and never waits for a Machine.

## Considered options

- **One Machine at a time, through a switcher.** The design this replaces: every Instance synced through the one `CodeClient` in context, so only one Machine's could be held, and Settings lived under that Machine's page.
- **Merging Machines in the app.** Rejected: a second copy of each Machine's records in a merged collection would need its own sync and its own idea of which Machine a row is from, which the Replica already has.

## Consequences

- `CodeReplicaLive` resolves a Machine's client from the Instance key instead of the surrounding context; adding a Machine to the list opens its Instance, and forgetting one closes it and deletes its local database (ADR 0004).
- A Machine that does not answer keeps what it last synced, marked by its Last Seen, without holding up the others.
- Screens draw from the local copy at once; a loading state appears only for data this device has never synced, which the Replica reports.
