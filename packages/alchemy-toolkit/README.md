# alchemy-toolkit

A curated subset of `alchemy`'s API surface, wrapped. Apps in this monorepo
depend on this package instead of on `alchemy` directly, so raw `alchemy`
imports live in one place and every flow in use here has been deliberately
chosen rather than reached for ad hoc.

## Layers

- `unstable/` — a flow gets wrapped here first. May depend on `stable/`.
- `stable/` — a flow earns its way here with a production track record and
  tests of its own. Never depends on `unstable/`.

Nothing has been promoted to `stable/` yet.
