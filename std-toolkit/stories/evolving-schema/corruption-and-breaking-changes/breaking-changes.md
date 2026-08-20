# Breaking changes

Three ways to break notes that are already written.

Two of them look harmless in a diff. Editing a version that has already shipped
leaves the version number alone, so old notes fail against a schema that still
claims to be theirs. Rewriting a migration that has already run forks history:
the same bytes decode two different ways depending on when they were read.

The third Story is the answer to both — an approved snapshot of the schema, and
a diff that can tell a safe change from a breaking one.
