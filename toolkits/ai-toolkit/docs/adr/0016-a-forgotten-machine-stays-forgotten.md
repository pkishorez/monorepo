---
status: accepted
---

# A forgotten Machine stays forgotten, and its Sign-in with it

A User forgets a Machine from the app, from anywhere, for example because it was compromised. auth-toolkit lets only the Auth Worker's own pages revoke a Sign-in (its ADR 0018), so neither the app nor the Machines Backend can end the Machine's Sign-in itself. Instead the Backend keeps the forgotten Machine as a tombstone naming its Sign-in, refuses every later Report from that Machine id or that Sign-in with `MachineForgotten`, and a Machine told so signs itself out, which revokes its token, and stops. The app's confirmation links to the Auth Worker's Home Page for revoking the Sign-in outright.

## Considered options

- **Let a First-Party app revoke one of its User's Sign-ins.** Rejected for now: it reverses part of auth-toolkit's ADR 0018, and needs that toolkit's own decision.
- **Delete the record and nothing else.** Rejected: the next Heartbeat would list the Machine again.

## Consequences

- A Machine that ignores the answer keeps a valid Sign-in at the Auth Worker, but the Backend never lists it again, so no app finds its address or key.
- Running `serve` again on a forgotten Machine's database signs in afresh and is refused while it keeps the same Machine id; `ai-toolkit logout` forgets the id along with the Sign-in, so the next start is a new Machine.
