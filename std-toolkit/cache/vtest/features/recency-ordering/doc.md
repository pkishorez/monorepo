# Recency ordering

Remember the `_u` field on every envelope? This is where it pays off. `_u` is
the **update key** — a monotonic, sortable string you assign when you write a
record (a timestamp, a sequence number, a ULID). The cache uses it to answer two
questions a collection can't otherwise answer cheaply:

- **What's the newest record?** `getLatest()`
- **What's the oldest record?** `getOldest()`

## Ordered by `_u`, not by insertion

The crucial point: ordering follows `_u`, _not_ the order you called `put`. You
can insert records out of order and still get the right newest/oldest, because
the cache compares the update keys, not arrival time.

```ts
// inserted out of order...
const out = ['u1:k-001', 'u2:k-003', 'u3:k-002'];

// ...yet getLatest() returns u2 — the highest _u, not the last inserted
```

This is what lets a cache rebuilt from an unordered backend still know which
record is current.

::test-group{id=latest-oldest}

## Empty collections answer None

There's no newest record in an empty drawer, so both queries return `None`
rather than throwing. Recency is a question, and "there's nothing here" is a
valid answer.

::test-group{id=empty}
