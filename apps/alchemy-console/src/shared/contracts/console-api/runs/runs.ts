import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';
import { GitHubError } from '../../github/index.ts';
import { RunError, RunUpdate } from '../../run/index.ts';

/**
 * The caller's runs. `watch` answers with the run, its events and its log
 * lines so far, then each change as it happens, in every tab; a watcher
 * keeps the highest `seq` it has, so nothing it hears twice counts twice.
 * A run that has ended is always its last update, so a watcher that hears
 * one can stop.
 * `cancel` stops a waiting run at once and asks a running one to stop.
 * `inspect` checks out one folder of one of the caller's repositories, at
 * the head of `ref` (its default branch when null), and reads its stack,
 * changing nothing: the run New Project starts before a project exists.
 */
export const Runs = RpcGroup.make(
  Rpc.make('watch', {
    payload: { runId: Schema.String },
    success: RunUpdate,
    error: RunError,
    stream: true,
  }),
  Rpc.make('cancel', {
    payload: { runId: Schema.String },
    error: RunError,
  }),
  Rpc.make('inspect', {
    payload: {
      connectionId: Schema.String,
      /** `owner/name`. */
      repo: Schema.String,
      /** From the repository's root; `.` or `''` for the root. */
      folder: Schema.String,
      setupCommand: Schema.NullOr(Schema.String),
      ref: Schema.NullOr(Schema.String),
    },
    /** The run's ID, to `watch`. */
    success: Schema.String,
    error: Schema.Union([RunError, GitHubError]),
  }),
).prefix('Runs.');
