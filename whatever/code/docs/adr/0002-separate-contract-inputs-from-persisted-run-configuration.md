# ADR 0002: Separate contract inputs from persisted run configuration

## Status

Accepted

## Context

TanStack harness packages expose current, adapter-specific option types. Those
types are useful at the RPC boundary but can change independently of the stored
data that this package must decode and evolve over time.

Using type-only schemas for persisted configuration would accept any runtime
value and would silently couple durable records to external package changes.

## Decision

RPC configuration fields use the current TanStack harness types through
`fromType`.

Persisted Thread and Run records use handcrafted, versioned Effect schemas that
contain only the harnesses and options supported by this package. Orchestrators
translate contract inputs into these persisted representations.

TanStack-native payloads intentionally stored without reinterpretation, such as
`UIMessage`, may use `fromType` in persistence.

Version 1 supports Codex and Claude Code.

## Consequences

- Contract types can follow upstream harness capabilities without changing old
  database records.
- Stored records receive runtime validation and explicit schema evolution.
- Adding a harness or persisted option requires an intentional domain-schema
  version change and input-to-persistence mapping.
- The contract and persistence representations are deliberately not the same
  type.
