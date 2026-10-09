# API cache query

Status: partial. Queries are Nodes and the app decides when they load, but
it can only tell them through a mailbox in the app's Layer (blocker 14).

## What was ported

Foldkit's `api-cache-query`: the API cache again, with `Query.define` owning
each fetch and its cached data while the parent decides when each one loads
or refreshes. Posts load at start, stats when their tab is first opened and
every 5 seconds while shown, a post's detail when it is opened, and a second
visit to a post is drawn from the cache.

```
ApiCacheQuery (root)       Model { tab, openPostId }; Provides Reader (a Request)
                           Lifetime: tick every 5 s; Commands tell Queries what to do
├─ posts: Query(Posts)     entries by key as AsyncData; a clicked row → Chose → Reader.open
├─ post: Query(Post)       keyed by post id; draws the key it was last told to load
└─ stats: Query(Stats)
query/    makeQuery: a Query Node from a name, a Schema and a fetch
          Orders: a mailbox per Query in the app's Layer; `tell(name, order)`
```

Opening a post is four Messages: `Chose` in Posts, `OpenedPost` in the app,
`Ordered` in Post, then `Settled`.

## Deviations

- **Orders go through a Service.** Foldkit's parent runs
  `posts.loadIfMissing(model)` on the Query's slice of its Model. Here each
  Query is its own Node, and a parent cannot send a Child a Message, so a
  parent's Command posts to the Query's mailbox and the Query's Lifetime
  hears it. Orders posted before the Query listens wait (the root's init
  Command runs before its Children exist).
- **Refresh and Retry go straight to the Query** from its own View, not
  through the parent.
- **No "Cached" badge on the list.** The badge needs the Post Query's Model
  while drawing the Posts Query: a View cannot read another Node.
- **The post Query shows the key it was last ordered**, since the app's
  `openPostId` cannot be handed to its View (roll-up 13).
- The unavailable post is the flaky one from `api-cache`, sharing its fake
  server; the 5-second tick runs while the tab is hidden (roll-up 12).
- `makeQuery` casts its Lifetime's needs: TypeScript cannot see that
  `Orders` is among `{ orders } & R`'s Services while `R` is generic.

## Blockers

- **A parent cannot send its Child a Message** (roll-up 14). This demo is
  the clearest case: Foldkit's parent drives its Queries. An API such as
  `tell: [[children.stats, { _tag: 'Revalidate' }]]` in Update's return, or
  a Command `Node.tell(child, message)`, would replace the mailbox. It is
  replay-safe: the told Message is sent and logged like any other.
- **A View cannot read another Node's Model** (roll-up 13): no Cached badge.
- **A Lifetime cannot follow the Model** (roll-up 12).

## Testing

Foldkit's stories select tabs and resolve `postsQuery`, `statsQuery` and
`postQuery` (each Query's Command is named after it), check that a cached
post asks for nothing, and that the interval revalidates only with data.
Scenes click through a fixture Model.

What Effect Oak would need:

- Named Commands (roll-up 4): `tell('Stats', …)` is an anonymous Effect, so a
  test cannot see which Query was told what.
- A way to test a Query Node with a stub Orders and Blog: `Runtime.start` with
  a stub Layer can do it today. A test of the whole app has to follow four
  Messages across three Nodes for one click.
- Roll-up 5 and 6, as everywhere.
