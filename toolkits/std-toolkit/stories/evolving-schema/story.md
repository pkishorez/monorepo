# Evolving schema

Change your data's shape whenever you like; rows saved years ago still read correctly.

Your app's data outlives its first design. A field gets added, renamed, or split, and the rows you already saved don't change with it. Rewriting them all before each release is slow and risky.

Instead you add a version to the shape and say how the previous one becomes it:

```ts
const Task = EntityESchema.make('Task', 'taskId', { title: Schema.String })
  .evolve('v2', { priority: Schema.Literals(['low', 'high']) }, (v1) => ({
    ...v1,
    priority: 'low' as const,
  }))
  .build();
```

Your code only ever sees the latest shape. Each step is a [migration](std-toolkit/evolving-schema/migrations) that runs as an old row is read, so nothing is rewritten up front, and [saving always stores the latest version](std-toolkit/evolving-schema/saving-always-uses-the-latest-version). Data saved before you used versions [reads as version 1](std-toolkit/evolving-schema/data-saved-before-versioning-reads-as-v1), and [a value from a newer version fails as outdated](std-toolkit/evolving-schema/a-value-from-a-newer-version-says-it-is-outdated), never as bad data. Every field must save as plain JSON; [one that cannot is refused](std-toolkit/evolving-schema/a-field-that-cannot-be-saved-as-json-is-refused) the moment you define the shape.

Once a version ships, its shape is frozen. A [snapshot](std-toolkit/evolving-schema/snapshot) of your table catches an edit that would break saved rows before you deploy it.
