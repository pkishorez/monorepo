import { Clock, Data, Effect } from 'effect';
import { nextUlid } from '@kestack/std-toolkit/core';
import { Harnesses } from '@kestack/ai-toolkit/harness';
import type { Raw } from '@kestack/ai-toolkit/contract';
import type { Session } from '../../../records/index.js';
import { Store } from '../../capabilities/index.js';
import { EngineRaw } from '../../engine-raw/index.js';
import type { SessionQuerySelf } from './actor.js';

/*
 * Where a Fork starts. A Fork Point is the end of a finished Turn: the
 * engine's `turn.ended` for it, carrying the agent's `nativeTurnId`
 * (ADR 0011). Nothing is copied into the Fork (ADR 0014): it names the
 * Session it was forked from, and reads what came before from there. The
 * agent is forked from the Session whose Raw holds that `turn.ended`.
 *
 * A Fork's own Raw starts after its Fork Point, so a Turn it inherited is
 * found up its `forkedFrom` chain, in each original only up to the Turn
 * the Fork was made after. That bound only ever tightens: a Fork made
 * after a Turn it inherited itself reads its original's original only up
 * to that Turn, never up to where its original was forked.
 *
 * `forkFrom` is what the fork Query answers: the Fork as a new Session
 * record, for the root to add. The agent is forked from the Session whose Raw
 * holds the Fork Point, by the Native Id its record keeps.
 */

export class NotForkable extends Data.TaggedError('NotForkable')<{
  readonly reason: string;
}> {}

const PAGE = 500;

const rawsOf = (sessionId: string) =>
  Effect.gen(function* () {
    const feed = (yield* Store).raws(sessionId);
    const all: Array<Raw> = [];
    let cursor: string | null = null;
    while (true) {
      const page: Effect.Success<ReturnType<typeof feed.after>> =
        yield* feed.after(cursor, PAGE);
      all.push(...page.items.map(({ value }) => value));
      if (!page.hasMore || page.items.length === 0) return all;
      cursor = page.items.at(-1)!.meta._u;
    }
  });

/** The Fork Point a Fork asks for: a Turn's end, in the Session that ran it. */
export interface ForkPoint {
  /** The Session whose Raw holds the Turn: the asked one or an original. */
  readonly sessionId: string;
  readonly turnId: string;
  readonly nativeTurnId: string;
}

const refuse = (reason: string) => Effect.fail(new NotForkable({ reason }));

/** The index of `turnId`'s `turn.ended` in `raws`; -1 when it has none. */
const endOf = (raws: ReadonlyArray<Raw>, turnId: string | null) =>
  raws.findLastIndex(
    (raw) =>
      EngineRaw.endedOf(raw) !== undefined &&
      (turnId === null || raw.turnId === turnId),
  );

/**
 * The Fork Point after `turnId`, or after the latest finished Turn when
 * null, in `sessionId` or up its `forkedFrom` chain; the Turn `running` is
 * never one.
 */
const forkPoint = (input: {
  readonly sessionId: string;
  readonly turnId: string | null;
  readonly running: string | null;
  /** Where a Session was forked from; null when it was not. */
  readonly forkedFrom: (
    sessionId: string,
  ) => Effect.Effect<Session['forkedFrom']>;
}): Effect.Effect<ForkPoint, NotForkable, Store> =>
  Effect.gen(function* () {
    if (input.turnId !== null && input.turnId === input.running)
      return yield* refuse('That Turn is still running');
    const seen = new Set<string>();
    let sessionId = input.sessionId;
    let turnId = input.turnId;
    // Up to and including this Turn's end in `sessionId`; null for all of it.
    let upTo: string | null = null;
    while (!seen.has(sessionId)) {
      seen.add(sessionId);
      const all = yield* rawsOf(sessionId);
      // Its own Raw holds the bound, or, inherited, nothing below it.
      const bound = upTo === null ? all.length - 1 : endOf(all, upTo);
      const raws = all.slice(0, bound + 1);
      const at = endOf(raws, turnId);
      if (at !== -1) {
        const end = raws[at]!;
        const nativeTurnId = EngineRaw.endedOf(end)?.nativeTurnId;
        if (nativeTurnId === undefined)
          return yield* refuse(
            'That Turn ended without a Fork Point, so it cannot be forked after',
          );
        return { sessionId, turnId: end.turnId, nativeTurnId };
      }
      if (turnId !== null && raws.some((raw) => raw.turnId === turnId))
        return yield* refuse('That Turn has not finished');
      const from = yield* input.forkedFrom(sessionId);
      if (from === null) break;
      sessionId = from.sessionId;
      turnId = turnId ?? from.turnId;
      // A bound this Session inherited stays: it is before `from.turnId`.
      if (upTo === null || bound !== -1) upTo = from.turnId;
    }
    return yield* refuse(
      input.turnId === null
        ? 'No Turn has finished yet'
        : 'This Session has no such Turn',
    );
  });

/** The Fork of this Session after `afterTurnId`, or after its latest finished Turn. */
export const forkFrom = (self: SessionQuerySelf, afterTurnId: string | null) =>
  Effect.gen(function* () {
    const { model, state } = yield* self.get;
    const asked = model.session;
    if (asked.nativeId === null)
      return yield* refuse('This session has no agent context to fork yet');
    const store = yield* Store;
    const point = yield* forkPoint({
      sessionId: asked.id,
      turnId: afterTurnId,
      running: state._tag === 'Running' ? state.turnId : null,
      forkedFrom: (id) =>
        id === asked.id
          ? Effect.succeed(asked.forkedFrom)
          : Effect.map(store.session(id), (found) => found?.forkedFrom ?? null),
    });
    // The Session that ran the Turn holds the agent's context at its end.
    const owner =
      point.sessionId === asked.id
        ? asked.nativeId
        : ((yield* store.session(point.sessionId))?.nativeId ?? asked.nativeId);
    const harnesses = yield* Harnesses;
    const forked = yield* harnesses
      .get(asked.harness)
      .fork({ cwd: model.cwd, nativeId: owner, at: point.nativeTurnId })
      .pipe(
        Effect.mapError(
          (error) =>
            new NotForkable({
              reason: `The agent could not fork: ${error.message}`,
            }),
        ),
      );
    const now = yield* Clock.currentTimeMillis;
    const fork: Session = {
      ...asked,
      id: yield* nextUlid,
      settings: { ...asked.settings },
      status: 'idle',
      nativeId: forked.nativeId,
      createdAt: now,
      // The Session forked, even when the Turn was one it inherited:
      // "Forked from" names what the user forked.
      forkedFrom: { sessionId: asked.id, turnId: point.turnId },
      settledAt: null,
      activeAt: now,
      endedAt: null,
    };
    return fork;
  });
