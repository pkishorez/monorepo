import { Clock, Effect, Option, Schema } from 'effect';
import { nextUlid } from '@kestack/std-toolkit/core';
import type { RawOut } from '../../harness/index.js';
import type { Projected, TurnEndStatus } from '../../projection/index.js';
import { TURN_END_STATUSES } from '../../projection/index.js';
import type { Raw, RawSource } from '../../raw/index.js';

/*
 * The Raw the engine writes itself, with `harness: 'engine'`: where a turn
 * starts (the user's text, and whether it steered a running turn), where it
 * ends when the harness could not say so, and a failure worth showing.
 */

const TurnStarted = Schema.Struct({
  text: Schema.String,
  steered: Schema.Boolean,
});
const TurnEnded = Schema.Struct({
  status: Schema.Literals(TURN_END_STATUSES),
  error: Schema.optional(Schema.String),
});
const Failure = Schema.Struct({ message: Schema.String });

const turnStarted = (text: string, steered: boolean): RawOut => ({
  kind: 'turn.started',
  payload: { text, steered },
});

const turnEnded = (status: TurnEndStatus, error?: string): RawOut => ({
  kind: 'turn.ended',
  payload: error === undefined ? { status } : { status, error },
});

const failure = (message: string): RawOut => ({
  kind: 'error',
  payload: { message },
});

const read = <A>(schema: Schema.Codec<A, unknown>, payload: unknown) =>
  Schema.decodeUnknownOption(schema)(payload);

/** One engine Raw to its projected form; null for a kind it does not know. */
const project = (raw: Raw): Projected | null => {
  switch (raw.kind) {
    case 'turn.started':
      return Option.match(read(TurnStarted, raw.payload), {
        onNone: () => null,
        onSome: ({ text, steered }) => ({
          agentId: null,
          role: 'user',
          parts: [{ type: 'turnStarted', text, steered }],
        }),
      });
    case 'turn.ended':
      return Option.match(read(TurnEnded, raw.payload), {
        onNone: () => null,
        onSome: ({ status, error }) => ({
          agentId: null,
          role: 'system',
          parts: [
            error === undefined
              ? { type: 'turnEnded', status }
              : { type: 'turnEnded', status, error },
          ],
        }),
      });
    case 'error':
      return Option.match(read(Failure, raw.payload), {
        onNone: () => null,
        onSome: ({ message }) => ({
          agentId: null,
          role: 'system',
          parts: [{ type: 'error', message }],
        }),
      });
    default:
      return null;
  }
};

/** Where a Raw record belongs: the session and turn, and who wrote it. */
export interface RawContext {
  readonly sessionId: string;
  readonly turnId: string;
  readonly harness: RawSource;
}

/** A whole Raw record from what a writer emitted, with a fresh id and the time now. */
const stamp = (context: RawContext, out: RawOut): Effect.Effect<Raw> =>
  Effect.gen(function* () {
    const id = yield* nextUlid;
    const at = yield* Clock.currentTimeMillis;
    return {
      id,
      sessionId: context.sessionId,
      turnId: context.turnId,
      harness: context.harness,
      kind: out.kind,
      agentId: out.agentId ?? null,
      payload: out.payload,
      at,
    };
  });

export const EngineRaw = { turnStarted, turnEnded, failure, project, stamp };

/** How the read path makes Messages of the engine's own Raw. */
export const projectEngineRaw = project;
