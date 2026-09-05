# Identity

Every name and key Sync mints lives here, one file each, as a branded string.
A brand is minted only by its constructor in this module, so the compiler
refuses a Partition key where a Collection Name is expected.

| Identity         | Minted by                                    | Compared | Parsed |
| ---------------- | -------------------------------------------- | -------- | ------ |
| `StdSyncName`    | `stdSyncName`                                | yes      | never  |
| `CollectionName` | `collectionName`                             | yes      | never  |
| `PartitionKey`   | `partitionKey`, global                       | yes      | never  |
| `HandlerName`    | `collectionHandlerName`, `actionHandlerName` | yes      | never  |
| `SyncAddress`    | the `*SyncAddress` fns                       | never    | never  |

Names and keys are identities: stored, mapped, and compared. A Sync Address is
a readable label for observability only; it is lossy and nothing may parse it.
`normalizeName` is the one normalization every name goes through, so two inputs
that normalize alike are the same identity.
