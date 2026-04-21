import { Rpc, RpcGroup } from '@effect/rpc';
import { Schema } from 'effect';
import { AppError } from './app.js';

export class TerminalRpcs extends RpcGroup.make(
  Rpc.make('open', {
    success: Schema.Struct({
      sessionId: Schema.String,
      alreadyRunning: Schema.Boolean,
    }),
    error: AppError,
    payload: Schema.Struct({
      absolutePath: Schema.String,
      name: Schema.optionalWith(Schema.String, { default: () => 'default' }),
    }),
  }),
  Rpc.make('write', {
    success: Schema.Void,
    error: AppError,
    payload: Schema.Struct({
      sessionId: Schema.String,
      data: Schema.String,
    }),
  }),
  Rpc.make('resize', {
    success: Schema.Void,
    error: AppError,
    payload: Schema.Struct({
      sessionId: Schema.String,
      cols: Schema.Number,
      rows: Schema.Number,
    }),
  }),
  Rpc.make('close', {
    success: Schema.Void,
    error: AppError,
    payload: Schema.Struct({ sessionId: Schema.String }),
  }),
  Rpc.make('stream', {
    success: Schema.String,
    error: AppError,
    payload: Schema.Struct({ sessionId: Schema.String }),
    stream: true,
  }),
).prefix('terminal.') {}
