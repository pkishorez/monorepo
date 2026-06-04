# Effect v4 migration learnings

Shared, append-only notes for migrating this monorepo's first-party packages
from Effect v3 to v4 (`4.0.0-beta.78`). **Read this file before starting a
package, and append any new transferable learning when you finish** (dedup by
symbol / topic — extend an existing entry rather than duplicating it).

## Pinned version

Everything Effect-related is pinned to the literal `4.0.0-beta.78` (no pnpm
catalog). All Effect ecosystem packages share one version in v4.

## Folded packages → core module mapping

These v3 packages have **no standalone v4 release**; their functionality now
lives inside the `effect` core package under `effect/unstable/*`. Remove the
package dependency and re-import from core.

| v3 package                          | v4 import path                                     |
| ----------------------------------- | -------------------------------------------------- |
| `@effect/rpc`                       | `effect/unstable/rpc`                              |
| `@effect/platform` (HttpApi / http) | `effect/unstable/httpapi` + `effect/unstable/http` |
| `@effect/cli`                       | `effect/unstable/cli`                              |
| `@effect/sql`                       | `effect/unstable/sql`                              |

Note: `effect/unstable/*` modules may take breaking changes in minor releases
(see `repos/effect-smol/MIGRATION.md`). Other unstable modules include `ai`,
`cluster`, `devtools`, `eventlog`, `jsonschema`, `observability`,
`persistence`, `process`, `reactivity`, `schema`, `socket`, `workflow`,
`workers`.

## Surviving standalone packages

These remain separate packages in v4 and are bumped to the matching beta:

- `@effect/platform-node` — `4.0.0-beta.78`
- `@effect/platform-browser` — `4.0.0-beta.78`
- `@effect/opentelemetry` — `4.0.0-beta.78`
- `@effect/vitest` — `4.0.0-beta.78`

## Reference

- Official v3→v4 guide: `repos/effect-smol/MIGRATION.md` (read-only vendored
  copy). Key sub-guides: services (`Context.Tag` → `Context.Service`), cause
  (flattened), error-handling (`catch*` renames), forking, yieldable,
  fiberref (`FiberRef` → `Context.Reference`), runtime (`Runtime<R>` removed),
  scope, equality, schema.

## Per-package learnings

(Append entries below as packages are migrated.)
