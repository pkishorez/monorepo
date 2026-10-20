import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';
import { RunError, RunnerEvent, RunResult, RunSpec } from '../run/index.ts';

/**
 * What the runner, inside its container, says to the User Space of the
 * user whose run it performs, over `/runner`: one socket, opened with the
 * run's token, that speaks for that one run only.
 *
 * - `spec`         the run to perform, with a GitHub token minted for it;
 * - `credentials`  the provider environment the run deploys with;
 * - `report`       one numbered step; `log` numbered output lines. Each is
 *                  stored once per number: the runner sends them in order
 *                  and sends one again until it is acknowledged, so a
 *                  dropped socket leaves no gap and no duplicate;
 * - `finish`       how it ended, once every step is acknowledged;
 * - `cancel`       ends with a value when the run's owner asks it to stop.
 *
 * A run that is over refuses everything with a `RunError` of `finished`.
 */
export const RunnerApi = RpcGroup.make(
  Rpc.make('spec', { success: RunSpec, error: RunError }),
  Rpc.make('credentials', {
    success: Schema.Record(Schema.String, Schema.String),
    error: RunError,
  }),
  Rpc.make('report', {
    payload: { seq: Schema.Number, event: RunnerEvent },
    error: RunError,
  }),
  Rpc.make('log', {
    payload: { seq: Schema.Number, lines: Schema.Array(Schema.String) },
    error: RunError,
  }),
  Rpc.make('finish', { payload: { result: RunResult }, error: RunError }),
  Rpc.make('cancel', {
    success: Schema.Literal('cancel'),
    error: RunError,
    stream: true,
  }),
);
