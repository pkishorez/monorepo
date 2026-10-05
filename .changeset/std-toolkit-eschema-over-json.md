---
'@kstackz/std-toolkit': patch
---

An ESchema's `schema` now keeps `_v` when sent as JSON, as Effect RPC and HTTP API do. Its JSON form was the latest version's fields alone, so encoding dropped `_v` and decoding read every value as v1: an evolved entity's write either failed with `Decode failed` or was migrated from v1 again, resetting fields added since. On the wire it is now the latest version with its `_v`, and an older or unversioned value is refused instead of migrated; stored values still migrate when read.
