# Writing notes back

A migration does not run when you write.

Each write goes in at the newest version. Storage thus receives only new notes.
An old version leaves storage one note at a time, as each note is saved again.

`encode` accepts the newest shape only. If you give it an older shape, it fails.
It does not migrate the value for you.

To save a note that has an old shape, read it first. `decode` moves it to the
newest shape. Then write the result.
