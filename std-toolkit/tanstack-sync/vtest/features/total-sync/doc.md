# Total sync

The everyday shape. `totalSync` mirrors an **entire** collection of one kind:
all the tasks, all the traces, all the logs. You give it a `schema` and a
`query` effect that fetches records, and it returns a TanStack collection config
that fills itself on mount and stays current.

This is exactly how the otel route wires its trace and log lists:

```ts
const std = createStdSync();

const traces = createCollection(
  std.totalSync({
    schema: TraceRecordSchema,
    query: ({ getCursor }) =>
      Effect.gen(function* () {
        const cursor = yield* getCursor;
        const res = yield* client.queryTraces({
          query: cursor ? { cursor: cursor.value.id } : {},
        });
        return res.items; // EntityType<TraceRecord>[]
      }),
  }),
);
```

## query loads the records

When the collection mounts, it runs `query` and writes every returned envelope
through the convergence rule from the first chapter: keyed by `getKey`, ordered
by `_u`. The result is a fully populated collection without a line of imperative
fetch-and-set code.

`query` receives a `getCursor` effect — the newest envelope already seen. On the
first run the cursor is `null` (nothing seen yet); the **next chapter** is all
about using it to fetch only what changed. Here we focus on the simplest case: a
query that returns its records and lands them in the collection.

::test-group{id=query-loads}

## Optimistic mutation through the envelope

`onInsert`, `onUpdate`, and `onDelete` let the collection write back to the
server. A successful `onDelete` removes the row locally — the same delete path a
fresh `_d` tombstone takes — so the UI stays consistent with the server.

::test-group{id=mutations}
