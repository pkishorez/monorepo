import { Clock, Effect, Option, Schema } from 'effect';
import { nextUlid } from '@kestack/std-toolkit/core';
import type { RawOut } from '@kestack/ai-toolkit/harness';
import {
  type Projected,
  type Raw,
  type RawSource,
  TURN_END_STATUSES,
  type TurnEndStatus,
} from '@kestack/ai-toolkit/contract';

/*
 * The Raw the engine writes itself, with `harness: 'engine'`: where a turn
 * starts (the user's text and Attachments, whether it steered a running
 * turn, or that the agent started it), where it ends, and a failure worth
 * showing.
 *
 * Every Turn ends with the engine's `turn.ended`, which carries the Turn's
 * Fork Point as `nativeTurnId` when the agent gave one. When the harness
 * says its own record already shows the end (`TurnEnd.shown`), it is marked
 * `byHarness` and projects to nothing, so a Turn never shows two ends.
 */

/** A file sent with a user message, as Raw keeps it. */
const Attachment = Schema.Struct({
  name: Schema.String,
  mime: Schema.String,
  size: Schema.Finite,
  data: Schema.optionalKey(Schema.String),
  path: Schema.optionalKey(Schema.String),
});

const TurnStarted = Schema.Struct({
  text: Schema.String,
  steered: Schema.Boolean,
  attachments: Schema.optionalKey(Schema.Array(Attachment)),
  agentStarted: Schema.optionalKey(Schema.Boolean),
});
type TurnStarted = typeof TurnStarted.Type;

const TurnEnded = Schema.Struct({
  status: Schema.Literals(TURN_END_STATUSES),
  error: Schema.optionalKey(Schema.String),
  nativeTurnId: Schema.optionalKey(Schema.String),
  byHarness: Schema.optionalKey(Schema.Boolean),
});
type TurnEnded = typeof TurnEnded.Type;

const Failure = Schema.Struct({ message: Schema.String });

/** Writes only the keys that say something, so old and new payloads read alike. */
const turnStarted = ({
  text,
  steered,
  attachments = [],
  agentStarted = false,
}: TurnStarted): RawOut => ({
  kind: 'turn.started',
  payload: {
    text,
    steered,
    ...(attachments.length === 0 ? {} : { attachments }),
    ...(agentStarted ? { agentStarted } : {}),
  },
});

const turnEnded = (
  status: TurnEndStatus,
  more: Omit<TurnEnded, 'status'> = {},
): RawOut => ({
  kind: 'turn.ended',
  payload: {
    status,
    ...(more.error === undefined ? {} : { error: more.error }),
    ...(more.nativeTurnId === undefined
      ? {}
      : { nativeTurnId: more.nativeTurnId }),
    ...(more.byHarness ? { byHarness: true } : {}),
  },
});

const failure = (message: string): RawOut => ({
  kind: 'error',
  payload: { message },
});

const read = <A>(schema: Schema.Codec<A, unknown>, payload: unknown) =>
  Schema.decodeUnknownOption(schema)(payload);

const engineRecord = <A>(
  schema: Schema.Codec<A, unknown>,
  kind: string,
  raw: Raw,
): A | undefined =>
  raw.harness === 'engine' && raw.kind === kind
    ? Option.getOrUndefined(read(schema, raw.payload))
    : undefined;

/** A `turn.started` the engine wrote, read back; undefined for any other Raw. */
const startedOf = (raw: Raw): TurnStarted | undefined =>
  engineRecord(TurnStarted, 'turn.started', raw);

/** A `turn.ended` the engine wrote, read back; undefined for any other Raw. */
const endedOf = (raw: Raw): TurnEnded | undefined =>
  engineRecord(TurnEnded, 'turn.ended', raw);

/** One engine Raw to its projected form; null for a kind it does not know. */
const project = (raw: Raw): Projected | null => {
  switch (raw.kind) {
    case 'turn.started':
      return Option.match(read(TurnStarted, raw.payload), {
        onNone: () => null,
        onSome: ({ text, steered, attachments, agentStarted }) => ({
          agentId: null,
          role: 'user',
          parts: [
            {
              type: 'turnStarted',
              text,
              steered,
              ...(attachments === undefined ? {} : { attachments }),
              ...(agentStarted === undefined ? {} : { agentStarted }),
            },
          ],
        }),
      });
    case 'turn.ended':
      return Option.match(read(TurnEnded, raw.payload), {
        onNone: () => null,
        onSome: ({ status, error, byHarness }) =>
          byHarness
            ? null
            : {
                agentId: null,
                role: 'system',
                parts: [
                  error === undefined
                    ? { type: 'turnEnded', status }
                    : { type: 'turnEnded', status, error },
                ],
              },
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

export const EngineRaw = {
  Attachment,
  turnStarted,
  turnEnded,
  failure,
  startedOf,
  endedOf,
  project,
  stamp,
};

/** How the read path makes Messages of the engine's own Raw. */
export const projectEngineRaw = project;
