# Each User has a Durable Object of their own

Status: accepted

Ledger used to keep every User's money in one D1 database, and each device
asked for what changed every 10 seconds, so a change made on a phone reached
the laptop up to 10 seconds later. In the realtime Sync Mode, now the
default, the cloud Backend keeps each User's money in a Durable Object of
their own, named by their user id. Every device holds a WebSocket to it and
is told of each change as it is made. D1 stays, behind the polling Sync Mode,
chosen in `constants.ts` when Ledger is built.

Both stores run the same handlers on the same table: a User's own object is
still partitioned by `userId`, though only they ever write there. Only the
services differ (`services/table`, and `services/broadcaster`, which D1 does
not have, so its Watch fails rather than ending and making clients poll in
disguise). The Worker checks the token in a socket's address only to pick the
object; every call on the socket is still checked by the token it carries.
The object sleeps between messages (hibernation), and keeps its open streams
in its own SQLite (rpc-toolkit's SQLite Stream Store) so they resume where
they were when it wakes.

## Considered options

- **D1 for everyone, with a faster poll.** Simple, but freshness costs a
  request every few seconds per device, and is never immediate.
- **D1 for storage, a Durable Object only to announce changes.** Pushes
  changes, but every write crosses two services, and the announcement and the
  write can disagree.
- **A Durable Object per User** (chosen). The store and the announcer are one
  place, so a change is pushed by whoever wrote it. The cost: a User's money
  is in many small databases, not one that can be queried across Users.

## Consequences

- Switching the Sync Mode does not move money: a User's money in D1 is not
  in their Durable Object. It is a build-time choice for that reason.
- The device Backend follows the Sync Mode too: in realtime its Watch hears
  every tab, through a Broadcaster shared over a BroadcastChannel.
