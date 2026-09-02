import { Schema } from 'effect';
import type { HandlerName } from '../../domain/identity/index.js';
import {
  outboxEntityBody,
  outboxEntryBody,
  outboxEntryStatus,
} from '../../domain/stored-entity/index.js';

declare const queueBrand: unique symbol;

export type QueueKey = string & { readonly [queueBrand]: 'QueueKey' };

export type OutboxStatus = typeof outboxEntryStatus.Type;
export type EntityBody = typeof outboxEntityBody.Type;
export type EntryBody = typeof outboxEntryBody.Type;

export type OutboxEntry = {
  readonly id: string;
  readonly name: HandlerName;
  readonly queue: QueueKey;
  readonly status: OutboxStatus;
  readonly enqueuedAt: string;
  readonly body: EntryBody;
};

export type PendingEntry = Omit<OutboxEntry, 'status'>;

export type OutboxOutcome = 'delivered' | 'failed';

export const queueKey = (name: HandlerName, key: string): QueueKey =>
  `${name}#${key}` as QueueKey;

export const decodeEntryBody = Schema.decodeUnknownEffect(outboxEntryBody);

export type Request =
  | { readonly op: 'insert'; readonly value: unknown }
  | {
      readonly op: 'update';
      readonly base: unknown;
      readonly after: unknown;
      readonly changed: ReadonlyArray<string>;
    }
  | { readonly op: 'delete'; readonly base: unknown }
  | { readonly op: 'nothing' };

export class OutboxUnreachable extends Schema.TaggedError<OutboxUnreachable>()(
  'OutboxUnreachable',
  { message: Schema.optional(Schema.String) },
) {}

export const isOutboxUnreachable = (error: unknown): boolean =>
  (error as { _tag?: unknown } | null)?._tag === 'OutboxUnreachable';

export class OutboxEntryFailed extends Schema.TaggedError<OutboxEntryFailed>()(
  'OutboxEntryFailed',
  { entryId: Schema.String, reason: Schema.String },
) {}

const REPLAY_KEY = 'std-toolkit/outbox-replay';

const replayMetadata = Schema.Struct({
  [REPLAY_KEY]: Schema.Struct({ entryId: Schema.String }),
});

export const outboxReplay = (entryId: string): Record<string, unknown> => ({
  [REPLAY_KEY]: { entryId },
});

const isReplay = Schema.is(replayMetadata);

export const replayEntryId = (metadata: unknown): string | null =>
  isReplay(metadata) ? metadata[REPLAY_KEY].entryId : null;
