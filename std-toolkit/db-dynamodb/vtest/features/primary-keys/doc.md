# Primary keys and partitions

The primary index decides _where_ an item lives and _how_ you query a group of
them. Two halves: the **partition key** (`pk`) gathers related items together,
and the **sort key** (`sk`) orders and addresses them within that partition.

## Deriving the partition key

You choose what the `pk` is built from when you call `.primary(...)`:

```ts
// pk = "User"  — every user shares one partition, addressed by userId
DynamoEntity.make(table).eschema(UserSchema).primary();

// pk = "Post#<authorId>" — posts are partitioned by author
DynamoEntity.make(table)
  .eschema(PostSchema)
  .primary({ pk: ['authorId'] });
```

The `sk` is always the schema's `idField`. So `.primary({ pk: ['authorId'] })`
on a `Post` keyed by `postId` stores each post at `pk = "Post#<authorId>"`,
`sk = <postId>` — every post for one author sits in one partition, sorted by
post id. This is single-table design's whole game: you co-locate the items you
read together under one partition key.

## Querying within a partition

`query('primary', { pk, sk })` returns the whole partition, filtered and ordered
by a sort-key condition. The condition is a single operator object — and the
operator also picks the direction:

- `{ '>=': null }` — everything, ascending
- `{ '<=': null }` — everything, descending
- `{ '>=': 'post-b' }` — from `post-b` onward, ascending
- `{ '<': 'post-c' }` — before `post-c`, descending

Pass `{ limit }` to cap the result. This is the whole query surface: you address
a partition by its key fields and walk its sort key. There is no ad-hoc filter.

::test-group{id=partition-query}
