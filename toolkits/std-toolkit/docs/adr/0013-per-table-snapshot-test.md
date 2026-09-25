# The per-table test file replaces the CLI

The `std-toolkit snapshot` CLI, its `std-toolkit.snapshot.ts` entry convention, its file-based baseline, and the Jiti dependency are removed. This supersedes ADR 0003. In their place `std-toolkit/snapshot/vitest` offers one call per table, `expectTableSnapshot(table, file)`. It captures the table snapshot and compares it with the committed JSON file as parsed data, so formatting never fails the test. On a mismatch the failure message is the classified change list, so a reviewer or an agent reads "Task v1 edited" rather than a JSON diff. `vitest -u` accepts the current document, as it does for any file snapshot.

The table snapshot is the only snapshot document. There is no ESchema-only document: a nested ESchema is captured under its own identity inside the table snapshot, and its versions are frozen by the same rules as a top-level one.

The test pins the set of versions, not migration behavior. A migration is code that reads the contract; a rewritten migration gets the same review as any other function, and a team that needs to pin a specific step writes a behavior test for it. An earlier draft stored generated **golden rows** per migration step in the file. It was dropped: it made the file large, raised a false positive when a nested schema evolved, and guarded something a normal test guards better.

Rejected: hashing migration source text, because formatters and minifiers change it; golden rows, for the reasons above; and a rendered text file beside the JSON, because the failure message already carries the readable form.
