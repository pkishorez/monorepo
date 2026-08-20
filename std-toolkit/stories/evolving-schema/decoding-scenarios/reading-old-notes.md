# Reading old notes

A migration runs when you read a note. It does not run at any other time.

Nothing asks for a migration. `decode` does the work:

1. It reads the version stamp on the stored row.
2. It checks the row against that version.
3. It runs each step above that version.
4. It gives the result to the caller.

Two things follow from this. The caller does not learn which version the note
came from, because `decode` removes the stamp. And a note only runs the steps
above its own version. A note at the newest version runs no steps.
