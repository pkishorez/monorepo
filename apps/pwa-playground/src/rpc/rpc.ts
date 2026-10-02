import * as Schema from 'effect/Schema';
import * as Rpc from 'effect/rpc/Rpc';
import * as RpcGroup from 'effect/rpc/RpcGroup';

/** Served by the Worker Server in src/sw.ts, called from the /rpc page. */
export const PlaygroundRpcs = RpcGroup.make(
  Rpc.make('Echo', {
    payload: { text: Schema.String },
    success: Schema.Struct({ text: Schema.String, at: Schema.String }),
  }),
  Rpc.make('Ticks', {
    payload: { count: Schema.Number },
    success: Schema.Number,
    stream: true,
  }),
  Rpc.make('WorkerInfo', {
    success: Schema.Struct({
      buildId: Schema.String,
      startedAt: Schema.String,
    }),
  }),
);
