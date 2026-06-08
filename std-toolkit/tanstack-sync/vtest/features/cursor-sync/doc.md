# Cursor sync

This is the incremental heart of the package. A full refetch downloads the world
every time; **cursor sync** downloads only what changed. The mechanism is the
`getCursor` effect handed to your `query`.

## getCursor is the high-water mark

`getCursor` resolves to the **newest envelope the collection has already seen** —
the row with the greatest `_u`, or `null` if the collection is empty. You send
its position to the server and ask for everything after it:

```ts
query: ({ getCursor }) =>
  Effect.gen(function* () {
    const cursor = yield* getCursor;
    const res = yield* client.queryTraces({
      query: cursor ? { cursor: cursor.value.id } : {},
    });
    return res.items;
  });
```

On first mount the cursor is `null`, so the query pulls from the beginning. After
records land, the cursor advances to the newest `_u`. The next `fetchMore()`
call sends _that_ position, and the server returns only the append-log since —
no re-sending of rows the collection already holds. The collection grows like a
log, never re-downloads like a snapshot.

`utils.fetchMore()` is how you drive a subsequent page by hand; it runs the
query again with the advanced cursor and returns how many new rows it wrote.

::test-group{id=cursor-advances}
