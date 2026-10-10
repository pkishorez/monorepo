# API cache

Status: works. Stats load when the app starts, not when their tab is first
opened (blocker below).

## What was ported

Foldkit's `api-cache`: a Posts tab whose list and post details are cached in
the Model (open a post, go back, open it again: no second fetch, a "Cached"
badge), Invalidate that refetches while the list stays on screen, a post that
fails every other fetch with Retry, and a Stats tab refetched every 5 seconds
while shown, keeping the old numbers on screen.

```
ApiCache (root)        Model { tab }; Provides Tabs { shown }
├─ posts: Posts        Model { list, details by id } as AsyncData
│                      Browsing | Reading { postId }; fetches are Commands asking Blog
└─ stats: Stats        Model { stats } as AsyncData; requires Tabs
                       Lifetime ticks every 5 s → Command reads Tabs → SawStatsShown → refetch
../async-data/         AsyncData as a Schema plus loadIfMissing, revalidate, settle… (shared)
../blog-server/        Blog Capability and its fake in-browser Layer, 700 ms per answer (shared)
```

## Deviations

- **The tab is Model data, both tabs are Children that always live.**
  Children belong to a State, so tabs as States would throw each tab's cache
  away on leaving it.
- **Stats load at start.** Foldkit loads them the first time the tab opens.
  The tab is the root's data and the root cannot tell its Stats Child
  anything (blocker 14), so Stats starts loading by itself.
- **The 5-second refetch ticks while the tab is hidden.** Each tick is a
  `TickedRevalidateStats` in the Log; a Command then reads the Tabs Capability
  and answers `SawStatsShown` only if Stats is shown. Foldkit's Subscription
  is switched on and off by `activeTab === 'Stats' && hasData`.
- Foldkit's `@foldkit/ui` Tabs are web-platform Tabs; AsyncData is a small
  shared module with Foldkit's helpers, plus a `Stale` case for a refresh that
  failed over cached data.
- The fake server is a Capability in the app's Layer, so its flaky counter is
  per app, and its `servedAt` is wall-clock time.

## Blockers

- **A parent cannot send its Child a Message** (new, roll-up 14). The root
  holds the tab and cannot say "you are shown now" to Stats. Stats asks
  instead: a Command reads the Tabs Capability, an Effect that reads the
  root's current tab.
- **A Lifetime cannot follow a parent's Model** (roll-up 12): the refetch
  timer cannot stop while the tab is hidden.

## Testing

Foldkit's stories (`story.test.ts`) select tabs and check that the first
visit fetches stats, that coming back to a tab with cached data asks for
nothing (`Command.expectNone()`), that opening a cached post does not
refetch, and resolve `FetchPosts`, `FetchPostDetail` and `FetchStats` with
fixtures from `main.fixture.ts`. `scene.test.ts` draws the Model and clicks
through it; `data.test.ts` checks the flaky server alone.

What Effect Oak would need:

- Named Commands (roll-up 4) to see that a cached visit asks for nothing and
  to answer a fetch with a fixture.
- A typed one-Update step (roll-up 5). The AsyncData helpers and the fake
  server are plain functions and Effects and can be tested today.
- Emitting a Lifetime's Message (roll-up 6) for the 5-second tick, and a way
  to give Stats a stub Tabs.

## Also surprising

- **A Provided Capability is built once per State**, not on every Model
  change, so Tabs exposes `shown` as an Effect that reads the root's current
  Model rather than a plain value.
- A Command's `Clock` is the app's Time, so `Clock.currentTimeMillis` would
  give "ms since start". Foldkit stamps `fetchedAt` from the Clock; here the
  server stamps wall-clock time.
