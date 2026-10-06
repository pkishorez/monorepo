# Ledger runs on a Remote or a Local Backend

Status: accepted

Ledger must run without Google, the Auth Worker, or a deployed Worker: for
someone trying it, for a browser test, and for an agent. It runs on one of two
Backends, chosen in Settings and changed at any time, in memory, without a
reload. The Remote Backend is the default; the Local Backend is opt-in, and
`?backend=local` chooses it from the address.

The Backend is written once, in `src/server/domain`: the Ledger API's
handlers and auth-toolkit's `authzLayer`, needing a table adapter and a
Resolver. Each Backend supplies only its edges. The Remote Backend gives it D1
and `resolverLive`, served over HTTP by the Worker, and its client half
`authLive`, HTTP, and copies in IndexedDB. The Local Backend gives it an
IndexedDB database of its own and `resolverLocal`, connected in-process by
rpc-toolkit's `layerInProcessProtocol`, and its client half `authLocal` and
copies in memory. So the browser runs the server's own code: the client
reaches `src/server` only through `src/server/backends/local`, and remote-only
packages stay in `src/server/backends/remote`.

`src/client/gate` reads the Backend, builds that Backend's Layer of the
services the app machine needs (`Auth`, `Sessions`, `Device`), and runs the
same machine on it. Changing the Backend closes the runtime, and with it the
Active Session, and starts again on the other. Each Backend keeps its own
Users, so changing back returns to the same one. Switch User now always
reaches every tab: a per-tab User would have made the Active Session mean two
things.

## Considered options

- **A Backend per origin**, the same build deployed at a second host. Rejected:
  the User could not move between Backends inside Ledger.
- **A second build behind an environment variable.** Rejected for the same
  reason, and two artifacts would have to stay in step.
- **A Backend state inside the app machine.** Rejected: every state would have
  to know which Backend it is on; outside it, the machine is the same for both
  and is tested once with fakes.
- **Auth chosen apart from data.** Rejected: Local auth on the Remote Backend
  would let anyone in, and Remote auth cannot reach a Backend inside the page.
