---
'std-toolkit': patch
---

Add the dependency-free `std-toolkit/db/memory` Adapter. `Memory.make(stdTable)` creates an isolated, immediately usable `MemoryTable` that implements the complete `StdTable` contract with ephemeral JavaScript state.
