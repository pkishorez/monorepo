import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';
import type { DepcruiseVizData } from 'depcruise-viz';

/** A genuine fs/exec failure while assembling a payload (not "not configured"). */
export class DevtoolsRpcError extends Schema.TaggedErrorClass<DevtoolsRpcError>(
  'DevtoolsRpcError',
)('DevtoolsRpcError', {
  message: Schema.String,
}) {}

const DepcruiseData = Schema.Any as unknown as Schema.Codec<DepcruiseVizData>;

const RunDepcruiseSuccess = Schema.Union([
  Schema.Struct({ available: Schema.Literal(false) }),
  Schema.Struct({
    available: Schema.Literal(true),
    data: DepcruiseData,
  }),
]);

/**
 * The path-driven DevTools procedure. It accepts an absolute package directory
 * and returns a discriminated availability union: `{ available: false }` when
 * the tool is not configured for that path, otherwise the full ready-to-render
 * payload.
 */
export const DevtoolsRpc = RpcGroup.make(
  Rpc.make('RunDepcruise', {
    payload: { path: Schema.String },
    success: RunDepcruiseSuccess,
    error: DevtoolsRpcError,
  }),
);
