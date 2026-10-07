# Identity

Every name and key Sync mints lives here, one file each, as a branded string.
A brand is minted only by its constructor in this module, so the compiler
refuses a Window key where a Collection Name is expected.

| Identity         | Minted by           | Compared | Parsed |
| ---------------- | ------------------- | -------- | ------ |
| `StdSyncName`    | `stdSyncName`       | yes      | never  |
| `CollectionName` | `collectionName`    | yes      | never  |
| `WindowKey`      | `windowKey`, global | yes      | never  |

Names and keys are identities: stored, mapped, and compared.
`normalizeName` is the one normalization every name goes through, so two inputs
that normalize alike are the same identity.
