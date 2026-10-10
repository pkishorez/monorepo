# Sync

Keep your app's screen fresh from your backend, with a local copy that opens offline and edits that show at once.

A web app that asks the server for everything feels slow, goes blank offline, and gets confused when it is open in two tabs. Writing your own cache to fix that is a project of its own.

You give each Collection a way to fetch changes and a way to save edits, then query it like any TanStack DB Collection:

```ts
const tasks = app.collection(Task, {
  sync: { global: strategy.oldToNew({ fetch, pollEvery: '5 seconds' }) },
  onUpdate: ({ current, updates }) => api.updateTask(current, updates),
});
```

[A new task shows at once, reaches the backend, and survives a reload](std-toolkit/sync/a-new-task-shows-at-once-and-survives-a-reload). [An edit shows at once, then the backend confirms it](std-toolkit/sync/an-edit-shows-at-once-then-is-confirmed).

Open the app in several tabs and [each sees what the other adds](std-toolkit/sync/two-tabs-see-each-others-changes), while [only one tab reads the backend](std-toolkit/sync/one-tab-reads-for-all) and another takes over when it closes. [Opening a board loads only that board](std-toolkit/sync/opening-a-board-loads-only-that-board). And [offline, the board stays on screen](std-toolkit/sync/offline-the-board-stays-and-edits-are-undone): an edit that cannot be saved is undone rather than shown as saved, and reading resumes once you are back.
