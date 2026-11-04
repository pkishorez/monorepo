import { Clock, Effect } from 'effect';
import type { Principal } from '@kestack/auth-toolkit';
import type { Entity } from '@kestack/std-toolkit/core';
import {
  type Connection,
  ConnectionForgotten,
  type ConnectionReport,
  ConnectionTaken,
  type PluginVersion,
  type ReleaseStanding,
  type ReportAnswer,
  SHELF_PATH,
  fromShelfKey,
  shelfKey,
} from '../../contract/index.js';
import { type ConnectionRecord, connections } from '../storage/index.js';

/*
 * Cloud Connect's rules, for the signed-in caller. A Connection id
 * belongs to the first User who reports it; another User reporting it is
 * refused ConnectionTaken. A forgotten Connection stays forgotten (ADR 0016): a
 * Report from its id, or from the Sign-in it last reported with, is refused
 * ConnectionForgotten, so a Connection that comes back under a new id on the same
 * Sign-in is refused too. A Report keeps the Connection's Display Name as
 * its User gave it; only its User renames it. Every Connection is told the same Deployment:
 * the latest Release of each Plugin, and the Minimum Connect, both those
 * Cloud Connect was deployed with. Where a Release stands is told by the
 * Deployment and the Shelf: the latest Release is `Latest`, any other on
 * the Shelf `Older`, since a Stage only ever puts its latest Release there
 * and never takes one off, and any other `Unknown`. Storage failing is a
 * defect.
 */

/** The latest Release of each Plugin, which every Connection should run, by name. */
export type Wanted = Readonly<Record<string, PluginVersion>>;

/** What Cloud Connect was deployed with: the Plugins every Connection should run, and the Minimum Connect, if told. */
export interface Deployment {
  readonly plugins: Wanted;
  readonly minConnect: string | null;
}

/** Whether the Shelf holds a file at `key`, `plugins/<name>/<sha256>.mjs`. */
export type OnShelf = (key: string) => Effect.Effect<boolean>;

/** Who is calling: their User id, and their Sign-in when they have one. */
const callerOf = (principal: Principal) => ({
  userId: principal.user.id,
  signInId: principal.kind === 'session' ? principal.session.id : null,
});

/** A stored Connection as Cloud Connect answers its Report, told the `deployment`. */
const toAnswer = (
  record: ConnectionRecord,
  deployment: Deployment,
): ReportAnswer => ({
  id: record.id,
  name: record.name,
  key: record.key,
  version: record.version,
  status: record.status,
  plugins: record.plugins,
  lastSeen: record.lastSeen,
  wanted: deployment.plugins,
  minConnect: deployment.minConnect,
});

/** A stored Connection as its User sees it, told the `deployment`. */
const toConnection = (
  record: ConnectionRecord,
  deployment: Deployment,
): Connection => ({
  ...toAnswer(record, deployment),
  displayName: record.displayName,
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
  deployment: Deployment,
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
            displayName: null,
          })
        : yield* connections.getAndUpdate({ id: input.id }, (current) => ({
            ...input,
            lastSeen,
            // A Report signed by an Access Token keeps the Sign-in last seen.
            signInId: signInId ?? current.signInId,
          }));
    return toAnswer(stored.value, deployment);
  }).pipe(
    // Two first Reports of one id at once: the loser reads the winner's.
    Effect.retry({ times: 2, while: raced }),
    Effect.catchTag('DatabaseError', Effect.die),
  );

const list = (principal: Principal, deployment: Deployment) =>
  owned(callerOf(principal).userId).pipe(
    Effect.map((found) =>
      found
        .filter(({ value }) => value.forgottenAt === null)
        .map(({ value }) => toConnection(value, deployment)),
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

/**
 * Gives the caller's Connection `id` its Display Name, trimmed, or none,
 * for `displayName` null or blank. Another User's Connection, or one
 * forgotten or gone, is left as it is.
 */
const rename = (principal: Principal, id: string, displayName: string | null) =>
  Effect.gen(function* () {
    const { userId } = callerOf(principal);
    const existing = yield* connections.get({ id });
    if (
      existing === null ||
      existing.value.userId !== userId ||
      existing.value.forgottenAt !== null
    )
      return;
    const named = displayName?.trim() || null;
    yield* connections.getAndUpdate({ id }, () => ({ displayName: named }));
  }).pipe(Effect.orDie);

/**
 * Where the Release `hash` of the Plugin `plugin` stands: `Latest` when the
 * `deployment` names it, `Older` when `onShelf` holds its file, else
 * `Unknown`, as is a name or hash no Shelf key could hold.
 */
const standing = (
  deployment: Deployment,
  onShelf: OnShelf,
  plugin: string,
  hash: string,
): Effect.Effect<ReleaseStanding> => {
  const named = Object.hasOwn(deployment.plugins, plugin)
    ? deployment.plugins[plugin]
    : undefined;
  if (named?.hash === hash) return Effect.succeed({ _tag: 'Latest' });
  const key = shelfKey(plugin, hash);
  if (fromShelfKey(key) === null) return Effect.succeed({ _tag: 'Unknown' });
  return Effect.map(
    onShelf(`${SHELF_PATH.slice(1)}/${key}`),
    (found): ReleaseStanding => ({ _tag: found ? 'Older' : 'Unknown' }),
  );
};

/** What each call does, for the caller `principal`, over storage. */
export const Registry = { report, list, forget, rename, standing };
