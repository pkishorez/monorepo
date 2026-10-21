import { Data, Effect } from 'effect';
import { nextUlid } from '@kestack/std-toolkit/core';
import type { Raw } from '../../raw/index.js';
import { Store } from '../../store/index.js';
import { EngineRaw } from '../engine-raw/index.js';

/*
 * Where a Fork starts, and the transcript it starts with. A Fork Point is
 * the end of a finished Turn: the engine's `turn.ended` for it, carrying
 * the agent's `nativeTurnId` (ADR 0011). The Fork's transcript is a copy of
 * the parent's Raw up to and including that `turn.ended`, each under a new
 * id in the Fork, so its Messages read as the parent's did. Raw, not
 * Messages, is copied: Messages are only ever projected from Raw.
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

/** The Fork Point a Fork asks for: a Turn's end, and the Raw up to it. */
export interface ForkPoint {
  readonly turnId: string;
  readonly nativeTurnId: string;
  /** The parent's Raw up to and including the Turn's end. */
  readonly transcript: ReadonlyArray<Raw>;
}

/**
 * The Fork Point after `turnId`, or after the latest finished Turn when
 * null; the Turn `running` is never one.
 */
export const forkPoint = (input: {
  readonly sessionId: string;
  readonly turnId: string | null;
  readonly running: string | null;
}): Effect.Effect<ForkPoint, NotForkable, Store> =>
  Effect.gen(function* () {
    const refuse = (reason: string) => Effect.fail(new NotForkable({ reason }));
    if (input.turnId !== null && input.turnId === input.running)
      return yield* refuse('That Turn is still running');
    const raws = yield* rawsOf(input.sessionId);
    const at = raws.findLastIndex(
      (raw) =>
        EngineRaw.endedOf(raw) !== undefined &&
        (input.turnId === null || raw.turnId === input.turnId),
    );
    if (at === -1) {
      if (input.turnId === null)
        return yield* refuse('No Turn has finished yet');
      return yield* refuse(
        raws.some((raw) => raw.turnId === input.turnId)
          ? 'That Turn has not finished'
          : 'This Session has no such Turn',
      );
    }
    const end = raws[at]!;
    const nativeTurnId = EngineRaw.endedOf(end)?.nativeTurnId;
    if (nativeTurnId === undefined)
      return yield* refuse(
        'That Turn ended without a Fork Point, so it cannot be forked after',
      );
    return {
      turnId: end.turnId,
      nativeTurnId,
      transcript: raws.slice(0, at + 1),
    };
  });

/** Writes a copy of `transcript` into the Session `sessionId`, in order. */
export const copyTranscript = (
  transcript: ReadonlyArray<Raw>,
  sessionId: string,
) =>
  Effect.gen(function* () {
    const store = yield* Store;
    for (const raw of transcript)
      yield* store.appendRaw({ ...raw, id: yield* nextUlid, sessionId });
  });
