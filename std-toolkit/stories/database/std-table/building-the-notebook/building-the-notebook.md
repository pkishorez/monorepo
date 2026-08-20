# Building the notebook

These four Stories add one piece each.

Each Story after this group imports a completed `table` and `note` from
`support.ts`. This group builds them. Each Story makes one decision, so nothing
arrives without an explanation.

1. **A table to put notes in.** A name and two key attributes. No field of a
   note is named yet. That separation is the point.
2. **Where a note lives.** The note is bound to the table. The `notebook` field
   becomes the partition. Notes in one notebook stay together.
3. **A second way to read.** The screen must list notes by title and by status.
   The table gets two more key slots over the same rows.
4. **The notebook we built.** This is the handover. Its questions assert that
   the table and the note built here are the ones that `support.ts` exports.

Because of that last Story, you can read the rest of part two without opening
the support file.
