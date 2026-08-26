# Snapshots

A Snapshot is a Note's picture, not the Note itself.

Capture turns a live ESchema into plain, serializable JSON: every version, every
field, on both its stored and its decoded side. Restore is the return trip — it
turns that JSON back into a live, working schema, with no access to the original
source.

Only a field shape that can make the whole trip is allowed. An object, a
primitive, a literal, a union, an array, an enum, a template literal, or a
branded value — always. A custom transformation, or a filter or declared type
without a stable identity, cannot, so `ESchema.make` refuses it the moment the
field is declared. Restore is never a best effort: if a schema built, it
restores.
