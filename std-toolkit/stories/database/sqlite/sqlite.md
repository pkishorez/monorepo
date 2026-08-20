# SQLite

DynamoDB is one HTTP API. IndexedDB is one browser API. SQLite is different. It
is an embedded engine, and each runtime supplies it in a different way.

This adapter therefore has a driver seam. No other adapter needs one.

The seam has three methods: `run`, `all`, and `transaction`. Anything that
executes SQL can supply them. That makes the seam a good place to add logging,
metrics, or retries.
