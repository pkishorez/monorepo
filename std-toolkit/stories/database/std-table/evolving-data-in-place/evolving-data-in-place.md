# Evolving data in place

Part one's ladder, now running inside a read.

A note written against an older schema folds forward as it comes out of the
table. There is no migration job, no backfill, and no rewrite: the stored row is
left exactly as it was, and the value handed to the caller is at the latest
version.

What happens when a row _cannot_ be decoded is in **Reference → Table limits &
failures**.
