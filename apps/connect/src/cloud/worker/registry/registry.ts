import { Clock, Effect } from 'effect';
import type { Principal } from '@kestack/auth-toolkit';
import type { Entity } from '@kestack/std-toolkit/core';
import {
  type Connection,
  ConnectionForgotten,
  type ConnectionReport,
  ConnectionTaken,
  type PluginVersion,
} from '../../contract/index.js';
import { type ConnectionRecord, connections } from '../storage/index.js';

/*
 * Cloud Connect's rules, for the signed-in caller. A Connection id
 * belongs to the first User who reports it; another User reporting it is
 * refused ConnectionTaken. A forgotten Connection stays forgotten (ADR 0016): a
 * Report from its id, or from the Sign-in it last reported with, is refused
 * ConnectionForgotten, so a Connection that comes back under a new id on the same
 * Sign-in is refused too. Every Connection is told the same wanted version
 * of each Plugin, the one Cloud Connect was deployed with. Storage failing
 * is a defect.
 */

/** The version of each Plugin every Connection should run, by name. */
export type Wanted = Readonly<Record<string, PluginVersion>>;

/** Who is calling: their User id, and their Sign-in when they have one. */
const callerOf = (principal: Principal) => ({
  userId: principal.user.id,
  signInId: principal.kind === 'session' ? principal.session.id : null,
});

/** A stored Connection as its User sees it, told the Plugins `wanted`. */
const toConnection = (
  record: ConnectionRecord,
  wanted: Wanted,
): Connection => ({
  id: record.id,
  name: record.name,
  key: record.key,
  version: record.version,
  status: record.status,
  plugins: record.plugins,
  lastSeen: record.lastSeen,
  wanted,
});

/** Every Connection `userId` ever reported, forgotten ones included. */
const owned = (userId: string) =>
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

/** Whether a write lost a race to another write of the same Connection. */
const raced = (error: unknown) => {
  const { _tag, reason } = error as {
    _tag?: unknown;
    reason?: { _tag?: unknown };
  };
  return (
    _tag === 'DatabaseError' &&
    (reason?._tag === 'ItemAlreadyExists' || reason?._tag === 'TransactFailed')
  );
};

const report = (
  principal: Principal,
  input: ConnectionReport,
  wanted: Wanted,
) =>
  Effect.gen(function* () {
    const { userId, signInId } = callerOf(principal);
    const existing = yield* connections.get({ id: input.id });
    if (existing !== null && existing.value.userId !== userId)
      return yield* new ConnectionTaken({ id: input.id });
    if (existing?.value.forgottenAt != null)
      return yield* new ConnectionForgotten({ id: input.id });
    if (signInId !== null) {
      const tombstones = (yield* owned(userId)).filter(
        ({ value }) => value.forgottenAt !== null,
      );
      if (tombstones.some(({ value }) => value.signInId === signInId))
        return yield* new ConnectionForgotten({ id: input.id });
    }
    const lastSeen = yield* Clock.currentTimeMillis;
    const stored =
      existing === null
        ? yield* connections.insert({
            ...input,
            userId,
            lastSeen,
            signInId,
            forgottenAt: null,
          })
        : yield* connections.getAndUpdate({ id: input.id }, (current) => ({
            ...input,
            lastSeen,
            // A Report signed by an Access Token keeps the Sign-in last seen.
            signInId: signInId ?? current.signInId,
          }));
    return toConnection(stored.value, wanted);
  }).pipe(
    // Two first Reports of one id at once: the loser reads the winner's.
    Effect.retry({ times: 2, while: raced }),
    Effect.catchTag('DatabaseError', Effect.die),
  );

const list = (principal: Principal, wanted: Wanted) =>
  owned(callerOf(principal).userId).pipe(
    Effect.map((found) =>
      found
        .filter(({ value }) => value.forgottenAt === null)
        .map(({ value }) => toConnection(value, wanted)),
    ),
    Effect.orDie,
  );

const forget = (principal: Principal, id: string) =>
  Effect.gen(function* () {
    const { userId } = callerOf(principal);
    const existing = yield* connections.get({ id });
    // Another User's Connection, or one gone already, is left as it is.
    if (
      existing === null ||
      existing.value.userId !== userId ||
      existing.value.forgottenAt !== null
    )
      return;
    const forgottenAt = yield* Clock.currentTimeMillis;
    yield* connections.getAndUpdate({ id }, (current) =>
      current.forgottenAt === null ? { forgottenAt } : {},
    );
  }).pipe(Effect.orDie);

/** What each call does, for the caller `principal`, over storage. */
export const Registry = { report, list, forget };
