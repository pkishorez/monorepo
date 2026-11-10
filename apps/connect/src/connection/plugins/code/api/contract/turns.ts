import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';
import { ESchema, ValueESchema } from '@kestack/std-toolkit/eschema';
import { AttachmentSchema } from '@kestack/ai-toolkit/contract';
import { SessionNotFound } from './errors.js';
import { Batch, Cursor } from './wire.js';

/* A Session's Turns: messages sent to it, and the Messages it emits. */

export const TurnsRpc = RpcGroup.make(
  /**
   * Starts a turn, or steers the running one, and un-settles the Session.
   * A model or settings given hold from this Turn on, within the Session's
   * harness.
   */
  Rpc.make('send', {
    payload: ValueESchema.make(
      'SendPayload',
      Schema.Struct({
        sessionId: Schema.String,
        text: Schema.String,
        attachments: Schema.Array(AttachmentSchema),
        model: Schema.optionalKey(Schema.String),
        settings: Schema.optionalKey(
          Schema.Record(Schema.String, Schema.String),
        ),
      }),
    ).build().schema,
    error: SessionNotFound,
  }),
  Rpc.make('cancel', {
    payload: ESchema.make('CancelPayload', {
      sessionId: Schema.String,
    }).build().schema,
    error: SessionNotFound,
  }),
  /**
   * A session's own Messages after the cursor, then each new one live. A
   * Fork's start after its Fork Point; what came before is the original's.
   */
  Rpc.make('messages', {
    payload: ESchema.make('MessagesPayload', {
      sessionId: Schema.String,
      ...Cursor.fields,
    }).build().schema,
    success: Batch,
    stream: true,
  }),
);
