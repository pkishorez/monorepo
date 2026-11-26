import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Effect, Schema, Stream } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';
import { PluginFolders, serve } from '../../plugin/index.js';

export const Echo = RpcGroup.make(
  Rpc.make('echo', {
    payload: { text: Schema.String },
    success: Schema.String,
  }),
  Rpc.make('count', {
    payload: { to: Schema.Number },
    success: Schema.Number,
    stream: true,
  }),
  Rpc.make('remember', {
    payload: { text: Schema.String },
    success: Schema.Array(Schema.String),
  }),
);

const notes = (data: string) => join(data, 'notes.txt');

export const EchoLive = Echo.toLayer({
  echo: ({ text }) => Effect.succeed(text),
  count: ({ to }) => Stream.range(1, to),
  remember: ({ text }) =>
    Effect.map(PluginFolders, ({ data }) => {
      appendFileSync(notes(data), `${text}\n`);
      return existsSync(notes(data))
        ? readFileSync(notes(data), 'utf8').trim().split('\n')
        : [];
    }),
});

export const runEcho = () =>
  serve({ name: 'echo', group: Echo, layer: EchoLive });
