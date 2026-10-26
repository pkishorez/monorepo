import { createServer } from 'node:net';
import { Effect, Layer, Schema, Scope, Stream } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';
import { describe, expect, it } from 'vitest';
import { client } from '@kestack/rpc-toolkit/rpc/websocket';
import { ESchema } from '@kestack/std-toolkit/eschema';
import { OnOutdated } from '@kestack/std-toolkit/replica';
import { versionedClient, VersionGap } from '../../cloud/client/index.js';
import { server } from '../server/index.js';

/*
 * What a call answers when one side is older, over a real socket, as Code
 * meets a Connection: the newer side reads the older one, and the older
 * side fails with `VersionGap`, naming itself. Effect RPC answers an Rpc the
 * server lacks, or a payload newer than it reads, with a defect, a
 * sentence; `versionedClient` makes that the server's gap. The client
 * older tells the app's `OnOutdated`.
 */

const NoteV1 = ESchema.make('Note', { text: Schema.String }).build();
const NoteV2 = ESchema.make('Note', { text: Schema.String })
  .evolve('v2', { pinned: Schema.Boolean }, (v1) => ({ ...v1, pinned: false }))
  .build();

const OlderApi = RpcGroup.make(
  Rpc.make('read', { success: NoteV1.schema }),
  Rpc.make('write', { payload: NoteV1.schema, success: Schema.String }),
  Rpc.make('watch', { success: NoteV1.schema, stream: true }),
);
const NewerApi = RpcGroup.make(
  Rpc.make('read', { success: NoteV2.schema }),
  Rpc.make('write', { payload: NoteV2.schema, success: Schema.String }),
  Rpc.make('watch', { success: NoteV2.schema, stream: true }),
  Rpc.make('fresh'),
);

const freePort = () =>
  new Promise<number>((resolve) => {
    const probe = createServer().listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });

const older = OlderApi.toLayer({
  read: () => Effect.succeed({ text: 'old' }),
  write: ({ text }) => Effect.succeed(text),
  watch: () => Stream.make({ text: 'old' }),
});

const newer = NewerApi.toLayer({
  read: () => Effect.succeed({ text: 'new', pinned: true }),
  write: ({ text }) => Effect.succeed(text),
  watch: () => Stream.make({ text: 'new', pinned: true }),
  fresh: () => Effect.void,
});

/** Runs `use` against the server `serve` makes, on a port of its own. */
const across = <A>(
  serve: (port: number) => Layer.Layer<never, unknown>,
  use: (port: number) => Effect.Effect<A, unknown, Scope.Scope>,
) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const port = yield* Effect.promise(freePort);
        yield* Layer.build(serve(port));
        return yield* use(port);
      }),
    ),
  );

/** A client of `group` on the server at `port`. */
const on = <Rpcs extends Rpc.Any>(
  group: RpcGroup.RpcGroup<Rpcs>,
  port: number,
) =>
  Effect.flatMap(
    Layer.build(client(group, { url: `ws://127.0.0.1:${port}/rpc` })),
    (context) => Effect.provideContext(versionedClient(group), context),
  );

describe('a call across versions', () => {
  it('a newer client reads an older server, and fails with the server older where it cannot', async () => {
    const seen = await across(
      (port) => server({ port, plugins: [{ api: OlderApi, layer: older }] }),
      (port) =>
        Effect.gen(function* () {
          const api = yield* on(NewerApi, port);
          return {
            read: yield* api.read(),
            watched: yield* Stream.runCollect(api.watch()),
            fresh: yield* Effect.flip(api.fresh()),
            write: yield* Effect.flip(api.write({ text: 'hi', pinned: true })),
          };
        }),
    );
    expect(seen.read).toEqual({ text: 'old', pinned: false });
    expect([...seen.watched]).toEqual([{ text: 'old', pinned: false }]);
    expect(seen.fresh).toEqual(new VersionGap({ older: 'server' }));
    expect(seen.write).toEqual(new VersionGap({ older: 'server' }));
    expect(seen.write.message).toBe(
      'The server is older: it lacks this call, or cannot read it',
    );
  });

  it('an older client fails with itself older on a newer answer, telling the app, and the newer server reads it', async () => {
    let told = 0;
    const seen = await across(
      (port) => server({ port, plugins: [{ api: NewerApi, layer: newer }] }),
      (port) =>
        Effect.gen(function* () {
          const api = yield* on(OlderApi, port);
          return {
            read: yield* Effect.flip(api.read()),
            watched: yield* Effect.flip(Stream.runCollect(api.watch())),
            write: yield* api.write({ text: 'hi' }),
          };
        }).pipe(
          Effect.provideService(
            OnOutdated,
            Effect.sync(() => {
              told += 1;
            }),
          ),
        ),
    );
    expect(seen.read).toEqual(new VersionGap({ older: 'client' }));
    expect(seen.watched).toEqual(new VersionGap({ older: 'client' }));
    expect(seen.write).toBe('hi');
    expect(told).toBe(2);
  });
});
