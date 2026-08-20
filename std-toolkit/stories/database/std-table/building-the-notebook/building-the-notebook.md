# Building the notebook

Four Stories, each adding one piece.

Everything after this group imports a ready-made `table` and `note` from
`support.ts`. This group is where they come from — assembled in the open, one
decision per Story, so the finished thing is never handed over unexplained:

1. **A table to put notes in** — a name and two key attributes. No field of a
   Note is named yet, and that separation is the point.
2. **Where a note lives** — the Note is bound to the table, and `notebook`
   becomes the partition. Notes filed together are stored together.
3. **A second way to read** — the notebook screen needs notes by title and by
   status, so the table grows two more key slots over the same rows.
4. **The notebook we built** — the handoff. Its questions assert that the table
   and Note assembled here are the ones `support.ts` exports.

That last Story is why the rest of Part two is readable without opening the
support file: what it imports has been shown to be what you just built.
