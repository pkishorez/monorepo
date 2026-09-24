# KAI Toolkit owns its StdTable

> **Status:** amended by ADR-0010. The table now declares five GSI slots: GSI1 for per-Thread feeds, GSI2 for global feeds, GSI3 to GSI5 reserved. Messages are batches written while a Run is live, not only completed ones, and there is no Durable Run Log.

The toolkit owns and exports `aiTable`, an adapter-independent StdTable containing only its evolving Thread, Run, and completed Message schemas and entity surfaces. `AiRpcLive` requires that table's StdTable service, and the consuming server supplies its concrete adapter table layer through normal Effect Layer composition. Pending interactions remain in the live Harness Host, and replayable AG-UI events belong to a separate Durable Run Log rather than the table.

Thread and Run keep common, indexable fields at the entity root. Each also stores a nested `data` discriminated union whose tag repeats the root harness: Claude data has `type: 'claude'`; Codex data has `type: 'codex'`. The duplication is deliberate because std-toolkit entities cannot use a discriminated union at their root.

The table starts with one GSI slot. Thread uses it as an update feed with an entity-scoped constant partition and `_u` sort key. Run and Message use the same slot with `threadId` as their partition and `_u` as their sort key. Message's primary partition is `runId`, so a completed run's transcript is directly queryable. `_u` is intentionally update order rather than creation order, allowing clients to request everything changed since their cursor.

Application entities belong to a separate application-owned StdTable. Sharing a physical table was rejected because KAI Toolkit must control and evolve its index topology, schemas, retention, and recovery records without constraining or being constrained by application access patterns. The application may still choose where and how each adapter table is deployed, but the two logical tables remain independent.
