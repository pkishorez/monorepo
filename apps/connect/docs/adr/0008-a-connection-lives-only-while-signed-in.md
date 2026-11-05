# A Connection lives only while its User is signed in

Status: accepted.

Connect is tied to its User's login. `actor-identity` is the root of the Connect CLI's tree, and the Connection is its Child in SignedIn, so one rule holds: signed in, everything runs, its Plugins once Connect Cloud names them (ADR 0010); signed out, nothing does. This replaces keeping the Plugins outside the login, which let them run on with a revoked Sign-in, at the cost of a tree with a second, hidden lifetime to reason about.

Only Connect Cloud saying the Sign-in names nobody, `Unauthenticated`, counts as logged out, and every Report is how that is found. A Report that could not be sent, or an Auth Worker that could not be asked, changes nothing, so a passing outage never stops a running Turn.

## Considered options

- **A revoked Sign-in closes only the tunnel, and the Plugins run on.** Rejected: it needs a Connection that outlives its login, and a program running for a User who has revoked its access is the surprising one.
- **Check the login on its own timer.** Rejected: a Report every 15 seconds already carries the Sign-in, and Connect Cloud already asks the Auth Worker about it.

## Consequences

- A confirmed logout cuts off running Turns and kills Background Jobs. Each Turn cut off Resumes once, when signed in again and the Plugins start.
- Until someone approves a new Sign-in at the terminal, the computer runs nothing.
- Which Plugin States exist stays on the computer: a Report carries only the Connection Status, so an App cannot show a crash or a Plugin's download progress, and reads a crashed Plugin as Updating.
