# IndexedDB

IndexedDB runs in a browser. Two things are true of it and of no other backend.

Its schema can only change inside a version-change transaction. The adapter must
therefore calculate the version. It increases the version only when a declared
store or index is absent.

It is also shared with other tabs. Those tabs hold connections to the same
database. An upgrade must wait until each of them releases its connection.
