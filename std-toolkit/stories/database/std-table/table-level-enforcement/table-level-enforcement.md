# Table-level enforcement

The CLI's `std-toolkit snapshot verify` is a lint: it compares source code
against a file, and a file is easy to forget to update. `table.verifySnapshot()`
is a second, independent line of defense — its baseline lives inside the table
itself, at a reserved key no real entity can produce, so a deployed table stays
protected even if nobody ever ran the lint.

A call reads that baseline, diffs it against the table's current, code-derived
shape, and only moves the baseline forward when the diff is safe. `safe` and
`requires-backfill` changes update it (the second logs a warning — an index
change is the operator's job to backfill, not a reason to fail the deploy).
`breaking` or `unverifiable` changes reject outright and leave the baseline
untouched, so a table that already holds data can never silently accept a
shape its stored rows cannot decode. The very first call, with nothing to
compare against, bootstraps instead of rejecting.

These stories run against Memory only, not the full four-adapter `parity()`
harness the rest of this directory uses. `verifySnapshot()` goes through the
same generic `StdTableContract` every adapter implements — one `getItem`, one
`writeItem` — so its logic is deliberately adapter-agnostic, and a single
adapter is enough to tell the story. That said, nothing here — story or unit
test — currently proves DynamoDB, SQLite, and IndexedDB actually agree on this
behavior; if that ever matters (e.g. a `getItem` consistency difference
between adapters), it belongs in a dedicated cross-adapter test, not assumed
from this narrative.
