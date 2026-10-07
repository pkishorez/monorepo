# The app's lifecycle is one XState machine on v6 alpha

Status: accepted; the machine moved to auth-toolkit's Gate (the monorepo's [ADR 0003](../../../docs/adr/0003-web-toolkit-and-the-gate.md)), still one XState machine, now opening a known account first and confirming it behind.

Names and paths below predate the monorepo's [ADR 0004](../../../docs/adr/0004-an-app-is-api-backend-and-stores.md), which renamed the Backends cloud and device and moved `src/client` to `src/app`.

Ledger's lifecycle (checking who is signed in, signed out, a Session opening,
open, and Switch User) is one XState machine run as an Effect actor through
`@xstate/effect`. The open Session is a scoped Effect resource held only
while the machine is in that state, so leaving it (switching or signing out)
closes the User's sync and runtime and nothing of theirs is left in context.
`xstate` 6 and `@xstate/effect` are alphas, pinned to exact versions and
imported only by `src/client/domain/machine` and the Gate that runs it, so a breaking alpha touches one
folder. Commands, Surfaces and the active Surface stay in `@kstackz/use-keys`
inside React: the machine owns only what outlives a Place.

## Considered options

- **XState 5 with a hand-written bridge to an Effect Scope.** Rejected for the
  blueprint: v6 with `@xstate/effect` is where both libraries are heading,
  and the bridge would be thrown away.
- **React effects and providers, as before.** Rejected: the lifecycle was
  spread over components, and switching Users had no single place to happen.
