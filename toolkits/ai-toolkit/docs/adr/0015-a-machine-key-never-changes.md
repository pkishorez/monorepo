---
status: moved to apps/connect/docs/adr/0003
---

# A Machine Key never changes

Status: moved to apps/connect/docs/adr/0003

A Machine is reached through a public tunnel address, and a browser cannot carry its Sign-in there: its cookie only reaches the Shared Cookie Domain, and browsers never hold tokens (auth-toolkit ADR 0019). So a Machine accepts a caller by its Machine Key instead, a secret it makes once, keeps with its own records, and lists for its User alongside its address. The key never rotates, and a lost or leaked key is lost for good. A browser sends it in the `Sec-WebSocket-Protocol` header, the one header page code may set on a WebSocket, so it stays out of URLs and most logs. We chose this for simplicity, knowing it is the weakest option.

## Considered options

- **A short-lived ticket signed by the cloud Backend** after it checks the browser's Sign-in, verified by the Machine against a key that never leaves it. Rejected for now: more moving parts than the first version needs.
- **A key that rotates on every start or every connection.** Rejected for now; it is the first step when this is revisited.
- **The Machine asks the Auth Worker about the caller.** Not possible: a browser has no token to send to another site.

## Consequences

- Anyone who can read the User's list of Machines, or who sees one key once, can reach that Machine, and through it run its Coding Harnesses, until the key is replaced by hand.
- To fix: rotate the key, or move to signed short-lived tickets, before a Machine is ever reached by anyone but its owner.
