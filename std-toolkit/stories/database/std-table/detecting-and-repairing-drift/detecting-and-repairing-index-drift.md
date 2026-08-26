# Detecting and repairing index drift

A schema-shape change heals itself on the next read — [evolving data in
place](../evolving-data-in-place/evolving-data-in-place.md) covers that. An
access-pattern change does not: a row written before a secondary index
existed cannot answer a query against it until something recomputes its
derived keys and writes them back.

`scan`, `drift`, and `reindex` are the three primitives for that: walk the
table, ask a row whether its stored keys still match what the current
registration would derive, and write the correction back without disturbing
`_u` or notifying subscribers — because nothing about the row's meaning
changed, only its physical representation. If decoding runs a Read migration,
the same reindex can persist the latest equivalent encoded payload. A primary
partition-key or sort-key difference is not repairable drift; `drift` fails
with `PrimaryKeyDrift` instead.
