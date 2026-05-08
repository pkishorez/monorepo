# @std-toolkit/tanstack-sync

Simplified TanStack DB integration built on TanStack DB native `CollectionConfig` sync. Three sync patterns, Effect-based mutations, ESchema integration, automatic cache management.

## Setup

```typescript
import { createStdSync } from '@std-toolkit/tanstack-sync';
import { createCollection } from '@tanstack/react-db';
import { IDBCache } from '@std-toolkit/cache/idb';

const std = createStdSync();

// Optional: persistent cache (shared across collections)
const persistentCache = new IDBCache('my-app', 1);
```

## Total Sync

Fetch all data eagerly. The sync layer loads cached data first, then fetches newer data with your Effect-based query.

```typescript
const usersCollection = createCollection(
  std.totalSync({
    schema: UserSchema,
    cache: persistentCache,
    query: (cursor) => api.getAllUsers(cursor),
    onInsert: (user) => api.createUser(user),
    onUpdate: ({ id, updates }) => api.updateUser(id, updates),
    onDelete: (id) => api.deleteUser(id),
  }),
);

// Fetch more (cursor-based pagination)
Effect.runPromise(usersCollection.utils.fetchMore());
```

## On-Demand

Partition-based loading. One field = one query handler. Data loads when queried.

```typescript
const messagesCollection = createCollection(
  std.onDemand({
    schema: MessageSchema,
    cache: persistentCache,
    queries: {
      channelId: (channelId, cursor) => api.getMessages(channelId, cursor),
    },
    onInsert: (msg) => api.createMessage(msg),
    onUpdate: ({ id, updates }) => api.updateMessage(id, updates),
    onDelete: (id) => api.deleteMessage(id),
  }),
);

// Fetch more for a specific partition
Effect.runPromise(messagesCollection.utils.fetchMore({ channelId: 'ch1' }));
```

## Single Item

Fetch one singleton (app settings, user profile).

```typescript
const appSettings = createCollection(
  std.singleItem({
    schema: AppSettingsSchema,
    cache: persistentCache,
    get: () => api.getSettings(),
    onUpdate: ({ updates }) => api.updateSettings(updates),
  }),
);
```

## Registry (Broadcast Routing)

Auto-collects all collections created through the factory. Route WebSocket messages to the right collection by entity name.

```typescript
const registry = std.registry();

onWebSocketMessage((msg) => registry.process(msg));
```

Messages matching `BroadcastSchema` are routed by `meta._e` to the matching collection's `upsert`.

## Cache

- **Default**: in-memory (no config needed)
- **Persistent**: pass an `IDBCache` instance via `cache` option
- Cache is only updated from API responses, never from broadcasts
- Refetch is additive — new data is merged into cache, existing records are preserved
- After page reload, broadcast-delivered data not yet fetched via API won't be in cache — next API call picks it up
