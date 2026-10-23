# One table test, and `-u` cannot approve a breaking change

Amended by ADR 0019: `acceptBreaking` is removed, and the test is for persistent tables; a table kept only in disposable tables needs none.

`expectTableSnapshot` is replaced by `expectTableShippable(table, file, options)`, the one test a table needs. This supersedes ADR 0013's "`vitest -u` accepts the current document" and ADR 0016's "checks are never compared".

## Decision

**One test.** `expectTableShippable` fails, listing every reason at once, unless the table can ship:

- every stored version of every schema the table reaches upgrades (ADR 0017), and a keyed row keeps its id and every partition-key path;
- the table snapshot has no breaking change against the committed file, other than one a person accepted;
- the committed file is up to date.

A table with no registered entities fails, so a test that forgot to import the modules defining them cannot pass empty.

**`-u` is not approval.** `vitest -u` writes the file only for changes that keep every stored row readable: appended versions, new entities, backfills, loosened checks. A breaking change and a failing upgrade fail the test under `-u` as without it, and the file is left as it was. A coding agent, like a person, can run `-u`; it should not be able to make a breaking change look reviewed by doing so.

**A breaking change is accepted by name.** `acceptBreaking: ['Task v1 edited']` lists each change by the one-line label the failure prints (`TableSnapshot.changeLabel`). There is no blanket flag: the entry is a line in a reviewed diff that names exactly what breaks. Once `-u` has written the file, the change no longer appears, and an entry that names no change fails the test, so an acceptance cannot linger and cover a later edit.

**Checks are part of a shipped version.** Every stored row passed its version's checks. On an approved version a check may be removed or loosened (a wider length or numeric bound) as a safe change; adding or tightening one is breaking, because a row that fails it no longer reads. Adding `finite` to a number is safe: no non-finite number reads back from JSON. A new check belongs in a new version whose migration makes old values pass it, which the upgrade check verifies.

## Consequences

The test cannot stop a determined edit. A hand-edited or deleted committed file hides a breaking change from the test, and an agent can write an `acceptBreaking` entry. Both show in review, and neither reaches production: the deploy guard compares against the snapshot in Alchemy state, not the file, and has no override. In CI, Vitest does not write a missing file, so deleting it fails the run.

A committed file the toolkit cannot read fails the test, under `-u` as without it: replacing an unreadable baseline would accept every breaking change against it unseen. Older document formats still read, since the document is an ESchema.

Under `-u`, Vitest writes file snapshots when the test file finishes, so the refusal must happen before `toMatchFileSnapshot` is called; it does.

Rejected: an environment variable to accept breaking changes, which anything that runs the tests can set without leaving a reviewed line; keeping checks display-only, which let a tightened check silently refuse stored rows; and two separate table tests, which let a table be checked for one and not the other.
