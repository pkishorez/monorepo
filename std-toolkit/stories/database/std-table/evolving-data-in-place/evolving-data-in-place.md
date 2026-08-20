# Evolving data in place

The steps from part one now run inside a read.

A note that was written against an older schema moves forward as it leaves the
table. There is no migration job. There is no backfill. There is no rewrite. The
stored row stays as it was. The value that the caller receives is at the newest
version.
