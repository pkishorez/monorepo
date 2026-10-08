# Snapshot

Catch a change that would break your saved rows before you deploy it, not after.

Once rows are saved under a version, editing that version means they no longer read. Your types can't see it, and your tests may not either.

A snapshot is a plain JSON picture of your table: its keys, its entities, and every version of every shape. You keep the one you last deployed and compare it with the one you are about to deploy:

```ts
const changes = TableSnapshot.diff(accepted, TableSnapshot.capture(table));
```

Each change is judged on its own. [Adding a version is safe](std-toolkit/evolving-schema/snapshot/adding-a-version-is-safe). [Editing a shipped version](std-toolkit/evolving-schema/snapshot/editing-a-shipped-version-is-caught), [dropping an entity that has rows](std-toolkit/evolving-schema/snapshot/dropping-a-stored-entity-is-caught), or [changing a partition key](std-toolkit/evolving-schema/snapshot/changing-a-partition-key-is-caught) is breaking. [A new index needs a backfill](std-toolkit/evolving-schema/snapshot/a-new-index-needs-a-backfill-not-a-refusal), which goes ahead with a warning.

A version is yours to change until it ships, but [dropping one strands the rows saved with it](std-toolkit/evolving-schema/snapshot/dropping-an-unshipped-version-strands-its-rows), so try drafts on the memory adapter.

A snapshot [saves as JSON and reads back the same](std-toolkit/evolving-schema/snapshot/a-snapshot-saves-as-json-and-reads-back), and [one broken by hand is refused](std-toolkit/evolving-schema/snapshot/a-hand-broken-snapshot-is-refused). Deploying with alchemy keeps the accepted snapshot for you and stops a breaking deploy.
