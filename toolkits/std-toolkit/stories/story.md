# std-toolkit

Define your data's shape once, change it whenever you like, store it on any database, and keep every screen in sync.

Your app's data has to be saved somewhere, change shape as the app grows, and show up fresh on screen. Usually that is three jobs written by hand: a data layer tied to one database, scripts that upgrade old rows, and a loop that keeps the browser's copy current.

With std-toolkit you describe each kind of thing once, and every part works from that description:

```ts
const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
}).build();
```

You save it as an [entity](std-toolkit/entities): many tasks found by key, or one settings record. When the shape needs to change, you [evolve it](std-toolkit/evolving-schema) by adding a version, and rows saved under the old one keep reading: [a change the deploy check calls safe keeps every saved task readable](std-toolkit/a-safe-shape-change-keeps-every-saved-task-readable).

All your entities share one table, and an [adapter](std-toolkit/adapters) puts it on DynamoDB, SQLite, IndexedDB, or memory, so changing databases changes one line. Then [sync](std-toolkit/sync) keeps your app's copy of that data fresh, opens offline, and sends edits back. Because it uses the same description, [tasks saved in an old shape arrive in the new one, and edits save back in it](std-toolkit/old-tasks-sync-into-your-app-in-todays-shape).
