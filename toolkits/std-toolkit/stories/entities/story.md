# Entities

Give each kind of thing your app saves a key and a place in your table, then save, read, and list it.

Your app keeps tasks, boards, people, and a settings record or two. Each needs saving, reading back, and finding again, and you don't want to write that for every one.

You bind a shape to your table and say which fields make up its key:

```ts
const task = table
  .entity(Task)
  .primary({ pk: ['boardId'] })
  .build();
```

Most things come many of a kind, like tasks on a board, each found by its key or an index. Those are [keyed entities](std-toolkit/entities/keyed). Some things exist exactly once, like your app's settings; a [single entity](std-toolkit/entities/single) always has a value, its default until you save one.

Both kinds read every saved version in the latest shape and tell subscribers about every saved change.
