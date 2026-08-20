# Reading old notes

Migrations run on the way _out_ of storage, and nowhere else.

Nothing in the notebook ever asks for a migration. Reading a note is what runs
one: `decode` reads the stamp on the stored row, validates the row against that
version, and folds it forward to the latest shape before the caller sees it.

Two things follow, and these Stories prove both:

- The caller never learns which version a note came from. The stamp is stripped.
- A note climbs only the rungs _above_ it. A note already at the latest version
  runs nothing at all.
