import { Rpc, RpcGroup } from '@effect/rpc';
import { Schema } from 'effect';
import { AppError } from './app.js';

export class GitRpcs extends RpcGroup.make(
  Rpc.make('getDiff', {
    success: Schema.Struct({
      patch: Schema.String,
      fileCount: Schema.optionalWith(Schema.Number, { default: () => 0 }),
      branch: Schema.optionalWith(Schema.String, { default: () => '' }),
    }),
    error: AppError,
    payload: Schema.Struct({
      absolutePath: Schema.String,
      statsOnly: Schema.optionalWith(Schema.Boolean, { default: () => false }),
    }),
  }),
  Rpc.make('commit', {
    success: Schema.Struct({
      hash: Schema.String,
      summary: Schema.String,
    }),
    error: AppError,
    payload: Schema.Struct({
      absolutePath: Schema.String,
      message: Schema.String,
    }),
  }),
  Rpc.make('generateCommitMessage', {
    success: Schema.Struct({
      subject: Schema.String,
      body: Schema.String,
    }),
    error: AppError,
    payload: Schema.Struct({
      absolutePath: Schema.String,
      patch: Schema.String,
    }),
  }),
  Rpc.make('listBranches', {
    success: Schema.Struct({
      current: Schema.String,
      branches: Schema.Array(Schema.String),
    }),
    error: AppError,
    payload: Schema.Struct({ absolutePath: Schema.String }),
  }),
  Rpc.make('checkoutBranch', {
    success: Schema.Struct({
      branch: Schema.String,
      created: Schema.Boolean,
    }),
    error: AppError,
    payload: Schema.Struct({
      absolutePath: Schema.String,
      branch: Schema.String,
      create: Schema.optionalWith(Schema.Boolean, { default: () => false }),
    }),
  }),
  Rpc.make('getRoot', {
    success: Schema.Struct({
      absolutePath: Schema.String,
      homePath: Schema.String,
    }),
    error: AppError,
    payload: Schema.Struct({ absolutePath: Schema.String }),
  }),
).prefix('git.') {}
