# Breaking changes

Three ways to break notes that are already written.

Two of them look safe in a diff.

If you edit a version that has already shipped, the version number stays the
same. Old notes then fail against a schema that still claims to be theirs.

If you rewrite a migration that has already run, history divides. The same bytes
then decode in two ways. The result depends on when the data was read.

The third Story is the answer to both. It uses an approved snapshot of the
schema. A diff against that snapshot separates a safe change from a breaking
one.
