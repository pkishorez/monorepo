# Core

The **shared vocabulary** every other std-toolkit package speaks. `eschema`
tells you how a value's _shape_ evolves over time. But a value rarely lives
alone in storage — it lives inside an **envelope**: a record that also carries
who the value is, what version it was written under, and whether it has been
deleted. `@std-toolkit/core` defines those envelopes, the metadata they carry,
and the structural descriptors that let a backend (DynamoDB, SQLite) explain its
own tables. The storage packages don't reinvent any of this; they import it from
here.

This is a pure schema/types package. It holds no logic — only the agreed-upon
shapes that let `cache`, `db-sqlite`, and `db-dynamodb` interoperate.

## The mental model

A stored record is never just your value. It is a **value plus meta** envelope.
Four ideas hold the package together:

1. **An entity is `{ value, meta }`.** `value` is your domain shape (typically
   an `eschema`'s type); `meta` is the bookkeeping the toolkit needs to manage
   it. `EntitySchema(eschema)` builds the codec for that pair, so a stored row
   validates as a single unit.

2. **Meta is the toolkit's bookkeeping, not yours.** `MetaSchema` carries four
   short keys: `_v` (schema version), `_e` (entity name), `_d` (soft-delete
   flag), `_u` (updated-at stamp). These are deliberately terse — they ride on
   every row. Your domain fields never collide with them because they live under
   `value`, not alongside it.

3. **Some things are singletons.** A per-user settings blob or a feature-flag
   document has no collection of siblings to soft-delete against. Those use
   `SingleEntityType` / `SingleEntityMetaSchema`, which drop `_d` — a singleton
   is either present or absent, never "deleted but retained".

4. **A backend describes itself with descriptors.** A `StdDescriptor` is a
   backend-agnostic statement of a table: its name, id field, version, and the
   partition/sort key **patterns** of each index. DynamoDB and SQLite both emit
   the same descriptor shape, so tooling can introspect either without knowing
   which backend it is talking to.

Schemas here are plain Effect `Schema`s, so you validate them with
`Schema.decodeUnknownEffect` inside `Effect.gen` / `yield*`.

## How the pieces fit

```
eschema  ──▶  your value's shape + how it evolves

EntitySchema(eschema)        ──▶  Schema<{ value, meta: Meta }>
   Meta = { _v, _e, _d, _u }       a collection member; can be soft-deleted

SingleEntitySchema(eschema)  ──▶  Schema<{ value, meta: SingleMeta }>
   SingleMeta = { _v, _e, _u }     a singleton; no _d

BroadcastSchema              ──▶  { _tag, values: [{ meta, value }] }
                                   a batch of entity envelopes on the wire

StdDescriptor                ──▶  { name, idField, version,
                                     primaryIndex, secondaryIndexes, schema }
                                   how a backend describes one table
```

## How to read this tutorial

Follow the features top-to-bottom. We start with **what core models** — the
value-plus-meta envelope — then the **entity meta** keys, then **EntitySchema**
that pairs value and meta into one codec. From there: the **single-entity**
variant for singletons, the **descriptors** a backend uses to describe its
tables, and finally **broadcast**, the batch envelope. Each feature teaches one
shape with a runnable example.
