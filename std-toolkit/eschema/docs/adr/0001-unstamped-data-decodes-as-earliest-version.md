# Unstamped data decodes as the earliest version

When `decode` receives a value with no `_v` stamp, it treats it as the earliest
version (`v1`) and folds it forward through every migration, rather than
assuming it is already the latest shape.

## Context

`encode` always writes a `_v` stamp, so the only way to obtain an unstamped
value is for it to predate adoption of the evolving schema — i.e. legacy data
persisted under a plain Effect Schema that a user later wrapped in an `ESchema`.
Such data is, by definition, in the oldest shape. The intuitive default
("missing `_v` = latest") is therefore backwards: on any evolved schema it tries
to parse v1-shaped legacy rows against the latest struct and fails, making
adoption a breaking change.

## Decision

Default a missing `_v` to `this.evolutions[0].version` (the head of the chain),
not `latestVersion`. This makes wrapping an existing schema a non-breaking,
incremental change: old rows decode as `v1` and migrate forward like any stamped
v1 row.

## Considered options

- **Missing `_v` = latest** (the original behavior). Intuitive, but breaks
  adoption the moment the schema evolves past v1.
- **Fallback chain** — try v1, then probe other versions on failure. Rejected:
  it makes decode ambiguous and can silently fold from a wrongly-guessed version
  into corrupt data.
- **A strict `requireStamp` mode** that rejects unstamped data (for schemas born
  evolving, where unstamped data can only be corruption). Rejected: no
  unvalidated path exists either way — unstamped is validated against `v1`,
  stamped against its own version — so the rule is deterministic and clear
  without a second mode. A born-evolving schema's `v1` simply validates the data
  it claims to be.

## Consequences

- The earliest version (`v1`) must match the schema the pre-wrap data was
  written with. This is an unenforced contract — eschema has no record of the
  original schema and cannot detect a mismatch.
- Unstamped data that does not match `v1` fails loudly; there is no fallback.
- The change is a no-op until a schema is evolved past `v1`: on a single-version
  schema `v1` is the latest, so unstamped data decodes identically either way.
  It only changes behavior once both an evolution and unstamped legacy data
  exist.
- **Under composition the contract applies independently at every nesting
  level.** A nested evolving schema (a field wrapped with `toSchema`) decodes
  through its own chain, so an unstamped nested value is folded forward from
  _its own_ `v1` — regardless of the parent's stamp. Parent and child can be
  adopted as evolving schemas on different timelines, so "unstamped" can mean a
  different vintage at each level, and decode cannot tell which. This multiplies
  the silent-corruption surface: each level's `v1` must match the shape its
  pre-wrap data was written with, and a mismatch buried one level deep folds
  forward into a corrupt sub-value inside an otherwise-valid parent. The failure
  is loud only when the nested `v1` decode rejects; if `v1` structurally accepts
  the legacy shape, the corruption is silent.
- **A nested evolution changes the parent's decoded output without bumping the
  parent's version.** Versioning is local to each evolving schema, but observable
  decode behavior is tree-wide: a parent stamped `v1` whose child has evolved
  `v1 → v2` yields child values folded forward to `v2`, with no change to the
  parent's `_v`. The "no-op until you evolve past `v1`" property is therefore a
  whole-tree statement, not a per-schema one — it holds only until _some_ schema
  anywhere in the nesting tree has both evolved and has unstamped data. Audit the
  whole tree, not just the schemas evolved directly.
- Migration-injected nested values are not subject to this: a parent migration
  returns decoded data directly and its output is never re-fed through the
  child's decode, so it needs no `_v` stamp.
