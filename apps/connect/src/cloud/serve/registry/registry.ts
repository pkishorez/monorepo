import { Clock, Effect } from 'effect';
import type { Principal } from '@kestack/auth-toolkit';
import type { Entity } from '@kestack/std-toolkit/core';
import {
  type Machine,
  MachineForgotten,
  type MachineReport,
  MachineTaken,
} from '../../contract/index.js';
import { type MachineRecord, machines } from '../storage/index.js';

/*
 * Cloud Connect's rules, for the signed-in caller. A Machine id
 * belongs to the first User who reports it; another User reporting it is
 * refused MachineTaken. A forgotten Machine stays forgotten (ADR 0016): a
 * Report from its id, or from the Sign-in it last reported with, is refused
 * MachineForgotten, so a Machine that comes back under a new id on the same
 * Sign-in is refused too. Storage failing is a defect.
 */

/** Who is calling: their User id, and their Sign-in when they have one. */
const callerOf = (principal: Principal) => ({
  userId: principal.user.id,
  signInId: principal.kind === 'session' ? principal.session.id : null,
});

/** A stored Machine as its User sees it. */
const toMachine = (record: MachineRecord): Machine => ({
  id: record.id,
  name: record.name,
  key: record.key,
  version: record.version,
  status: record.status,
  lastSeen: record.lastSeen,
});

/** Every Machine `userId` ever reported, forgotten ones included. */
const owned = (userId: string) =>
  Effect.gen(function* () {
    const found: Array<Entity<MachineRecord>> = [];
    let after: Entity<MachineRecord> | undefined;
    while (true) {
      const { items, hasMore } = yield* machines.query(
        'byOwner',
        { pk: { userId }, '>=': null },
        after === undefined ? {} : { after },
      );
      found.push(...items);
      after = items.at(-1);
      if (!hasMore || after === undefined) return found;
    }
  });

/** Whether a write lost a race to another write of the same Machine. */
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

const report = (principal: Principal, input: MachineReport) =>
  Effect.gen(function* () {
    const { userId, signInId } = callerOf(principal);
    const existing = yield* machines.get({ id: input.id });
    if (existing !== null && existing.value.userId !== userId)
      return yield* new MachineTaken({ id: input.id });
    if (existing?.value.forgottenAt != null)
      return yield* new MachineForgotten({ id: input.id });
    if (signInId !== null) {
      const tombstones = (yield* owned(userId)).filter(
        ({ value }) => value.forgottenAt !== null,
      );
      if (tombstones.some(({ value }) => value.signInId === signInId))
        return yield* new MachineForgotten({ id: input.id });
    }
    const lastSeen = yield* Clock.currentTimeMillis;
    const stored =
      existing === null
        ? yield* machines.insert({
            ...input,
            userId,
            lastSeen,
            signInId,
            forgottenAt: null,
          })
        : yield* machines.getAndUpdate({ id: input.id }, (current) => ({
            ...input,
            lastSeen,
            // A Report signed by an Access Token keeps the Sign-in last seen.
            signInId: signInId ?? current.signInId,
          }));
    return toMachine(stored.value);
  }).pipe(
    // Two first Reports of one id at once: the loser reads the winner's.
    Effect.retry({ times: 2, while: raced }),
    Effect.catchTag('DatabaseError', Effect.die),
  );

const list = (principal: Principal) =>
  owned(callerOf(principal).userId).pipe(
    Effect.map((found) =>
      found
        .filter(({ value }) => value.forgottenAt === null)
        .map(({ value }) => toMachine(value)),
    ),
    Effect.orDie,
  );

const forget = (principal: Principal, id: string) =>
  Effect.gen(function* () {
    const { userId } = callerOf(principal);
    const existing = yield* machines.get({ id });
    // Another User's Machine, or one gone already, is left as it is.
    if (
      existing === null ||
      existing.value.userId !== userId ||
      existing.value.forgottenAt !== null
    )
      return;
    const forgottenAt = yield* Clock.currentTimeMillis;
    yield* machines.getAndUpdate({ id }, (current) =>
      current.forgottenAt === null ? { forgottenAt } : {},
    );
  }).pipe(Effect.orDie);

/** What each call does, for the caller `principal`, over storage. */
export const Registry = { report, list, forget };
