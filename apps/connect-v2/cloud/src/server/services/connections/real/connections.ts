import { Clock, Effect, Layer } from 'effect';
import type { Principal } from '@kestack/auth-toolkit';
import type { Entity } from '@kestack/std-toolkit/core';
import {
  SQLite,
  type SQLiteDriver,
  type SQLiteTable,
} from '@kestack/std-toolkit/db/sqlite';
import {
  ConnectionRemoved,
  ConnectionTaken,
  type Report,
} from '../../../rpc/heartbeat/contract/index.js';
import { ConnectionNotFound } from '../../../rpc/app/contract/index.js';
import { Connections, type KeptConnection } from '../contract/index.js';
import {
  type ConnectionRecord,
  connections,
  connectionsTable,
} from './table.js';

const callerOf = (principal: Principal) => ({
  userId: principal.user.id,
  signInId: principal.kind === 'session' ? principal.session.id : null,
});

const kept = (record: ConnectionRecord): KeptConnection => ({
  id: record.id,
  name: record.name,
  displayName: record.displayName,
  version: record.version,
  url: record.url,
  key: record.key,
  lastSeen: record.lastSeen,
  choices: record.choices,
});

const everyOwnedBy = (userId: string) =>
  Effect.gen(function* () {
    const found: Array<Entity<ConnectionRecord>> = [];
    let after: Entity<ConnectionRecord> | undefined;
    while (true) {
      const { items, hasMore } = yield* connections.query(
        'byOwner',
        { pk: { userId }, '>=': null },
        after === undefined ? {} : { after },
      );
      found.push(...items);
      after = items.at(-1);
      if (!hasMore || after === undefined) return found;
    }
  });

const lostARace = (error: unknown) => {
  const { _tag, reason } = error as {
    _tag?: unknown;
    reason?: { _tag?: unknown };
  };
  return (
    _tag === 'DatabaseError' &&
    (reason?._tag === 'ItemAlreadyExists' || reason?._tag === 'TransactFailed')
  );
};

const report = (principal: Principal, input: Report) =>
  Effect.gen(function* () {
    const { userId, signInId } = callerOf(principal);
    const existing = yield* connections.get({ id: input.id });
    if (existing !== null && existing.value.userId !== userId)
      return yield* new ConnectionTaken({ id: input.id });
    if (existing !== null && existing.value.removedAt !== null)
      return yield* new ConnectionRemoved({ id: input.id });
    if (signInId !== null) {
      const removed = (yield* everyOwnedBy(userId)).filter(
        ({ value }) => value.removedAt !== null,
      );
      if (removed.some(({ value }) => value.signInId === signInId))
        return yield* new ConnectionRemoved({ id: input.id });
    }
    const lastSeen = yield* Clock.currentTimeMillis;
    const reported = {
      name: input.name,
      version: input.version,
      url: input.url,
      key: input.key,
      lastSeen,
    };
    const written =
      existing === null
        ? yield* connections.insert({
            id: input.id,
            ...reported,
            userId,
            signInId,
            removedAt: null,
            displayName: null,
            choices: {},
          })
        : yield* connections.getAndUpdate({ id: input.id }, (current) => ({
            ...reported,
            signInId: signInId ?? current.signInId,
          }));
    return written.value.choices;
  }).pipe(
    Effect.retry({ times: 2, while: lostARace }),
    Effect.catchTag('DatabaseError', Effect.die),
  );

const ownedLive = (principal: Principal, id: string) =>
  Effect.map(connections.get({ id }), (existing) =>
    existing === null ||
    existing.value.userId !== callerOf(principal).userId ||
    existing.value.removedAt !== null
      ? null
      : existing.value,
  );

const find = (principal: Principal, id: string) =>
  Effect.flatMap(Effect.orDie(ownedLive(principal, id)), (found) =>
    found === null
      ? Effect.fail(new ConnectionNotFound({ id }))
      : Effect.succeed(kept(found)),
  );

const list = (principal: Principal) =>
  everyOwnedBy(callerOf(principal).userId).pipe(
    Effect.map((found) =>
      found
        .filter(({ value }) => value.removedAt === null)
        .map(({ value }) => kept(value)),
    ),
    Effect.orDie,
  );

const remove = (principal: Principal, id: string) =>
  Effect.gen(function* () {
    if ((yield* ownedLive(principal, id)) === null) return;
    const removedAt = yield* Clock.currentTimeMillis;
    yield* connections.getAndUpdate({ id }, (current) =>
      current.removedAt === null ? { removedAt } : {},
    );
  }).pipe(Effect.orDie);

const rename = (principal: Principal, id: string, displayName: string | null) =>
  Effect.gen(function* () {
    yield* find(principal, id);
    const named = displayName?.trim() || null;
    yield* Effect.orDie(
      connections.getAndUpdate({ id }, () => ({ displayName: named })),
    );
  });

const choose = (
  principal: Principal,
  id: string,
  plugin: string,
  choice: 'enabled' | 'disabled',
) =>
  Effect.gen(function* () {
    yield* find(principal, id);
    yield* Effect.orDie(
      connections.getAndUpdate({ id }, (current) => ({
        choices: { ...current.choices, [plugin]: choice },
      })),
    );
  });

type Table = Layer.Success<SQLiteTable<'connections'>['layer']>;

const make = Effect.gen(function* () {
  const table = yield* Effect.context<Table>();
  const over = <A, E>(effect: Effect.Effect<A, E, Table>) =>
    Effect.provideContext(effect, table);
  return Connections.of({
    report: (principal, input) => over(report(principal, input)),
    list: (principal) => over(list(principal)),
    find: (principal, id) => over(find(principal, id)),
    rename: (principal, id, displayName) =>
      over(rename(principal, id, displayName)),
    remove: (principal, id) => over(remove(principal, id)),
    choose: (principal, id, plugin, choice) =>
      over(choose(principal, id, plugin, choice)),
  });
});

export const connectionsLayer = (driver: SQLiteDriver) =>
  Layer.effect(Connections, make).pipe(
    Layer.provide(SQLite.make(connectionsTable, { database: driver }).layer),
  );
