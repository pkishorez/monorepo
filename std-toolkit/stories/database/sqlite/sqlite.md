# SQLite

One engine, four runtimes.

DynamoDB is one HTTP API. IndexedDB is one browser API. SQLite is an embedded
engine that surfaces differently in every runtime it is embedded in — so this
adapter is the only one with a driver seam.

The seam is three methods wide: `run`, `all`, and `transaction`. That is small
enough to implement over anything that executes SQL, which makes it a natural
place to add logging, metrics, or retries.
