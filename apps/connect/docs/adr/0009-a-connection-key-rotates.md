# A Connection Key rotates

Status: accepted. Supersedes [ADR 0003](0003-a-machine-key-never-changes.md).

A browser still cannot carry its Sign-in to a Connection's tunnel address, so a Connection still accepts a caller by its Connection Key, offered in the `Sec-WebSocket-Protocol` header (ADR 0003 says why). What changes is how long a key lasts. Under ADR 0003 a key seen once worked for good. Now a Connection holds one key at a time, in memory: it mints one as its port opens, and a new one every hour. A new start, or signing in again, makes a new Connection and so a new key. Every Report carries the key, and a new one is Reported at once, so Connect Cloud lists it within seconds.

The key is checked only as a socket connects, so a socket already open stays open through a rotation. A socket offering any other key is taken and closed at once with 4401, `KEY_EXPIRED`, because a browser cannot read the status of a refused WebSocket upgrade, only how the socket closed. A plain HTTP request with any other key gets 401. Any wrong key reads as expired: the Connection keeps one key, so it cannot tell an old key from a made-up one. An App whose socket closes with 4401 asks Connect Cloud for its list at once, and connects again with the key as listed.

A request with no key still gets 401, and a bad origin still gets 403, checked first. `/health` stays open.

## Considered options

- **Accept the previous key for a while after a rotation.** Rejected: an App already asks for the new key when told 4401, so a second key would only let an old one work longer.
- **Rotate only on every start.** Rejected: a Connection runs for as long as its computer does, so a key seen once could work for weeks.
- **A new key for every connection.** Rejected: the key is one value on the list, shared by every App and tab, so each connect would turn away the next caller holding the same list.
- **A short-lived ticket signed by Connect Cloud.** Still not chosen, as in ADR 0003: more moving parts. It is the next step before a Connection is ever reached by anyone but its owner.

## Consequences

- Anyone who can read the User's list of Connections can get the current key, and through it run the Connection's Coding Harnesses.
- A stolen key already connected stays connected. One not yet connected works until the next rotation, an hour at most.
- During a Connect Cloud outage after a rotation, an App cannot reconnect, as it cannot learn the new key. Sockets already open go on.
- `connection.json` is v2 and keeps no key. A file with a key still reads, and the key is dropped at the next start.
