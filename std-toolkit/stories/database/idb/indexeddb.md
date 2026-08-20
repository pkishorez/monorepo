# IndexedDB

Living in a browser.

Two things are true of IndexedDB and no other backend. Its schema can only
change inside a version-change transaction, so the adapter has to do version
arithmetic — bumping only when a declared store or index is actually missing.

And it is shared with strangers. Other tabs hold connections to the same
database, and an upgrade needs every one of them to let go first.
