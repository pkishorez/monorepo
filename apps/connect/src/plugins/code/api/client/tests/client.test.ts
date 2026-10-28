import { Effect, Fiber, Layer, Stream } from 'effect';
import {
  connection as RpcConnection,
  type SocketWatch,
} from '@kestack/rpc-toolkit/rpc/websocket';
import { describe, expect, it } from 'vitest';
import {
  mismatchReason,
  PLUGIN_MISMATCH,
} from '../../../../../cloud/contract/index.js';
import { CodeClient, CodeClients, type LinkStatus } from '../client.js';

/*
 * A Connection running another Release of the code Plugin closes the
 * socket at once with `PLUGIN_MISMATCH`: until a socket to it is answered,
 * its Link is not linked, though the socket opened, and `mismatch` says
 * which Release it runs.
 */

const HASH = 'b'.repeat(64);

const wait = (ms = 20) =>
  Effect.promise(() => new Promise((done) => setTimeout(done, ms)));

/** Every Connection's socket always open, each telling the test how it answers and closes. */
const opened = () => {
  const watches = new Map<string, SocketWatch>();
  const layer = CodeClients.make((connectionId, watch) =>
    Layer.mergeAll(
      Layer.effectDiscard(
        Effect.sync(() => void watches.set(connectionId, watch)),
      ),
      Layer.mock(CodeClient)({}),
      Layer.mock(RpcConnection)({
        connectionStatus: Stream.concat(
          Stream.make('connected' as const),
          Stream.never,
        ),
        keepSubscribed: (subscribe) => subscribe(),
        hooks: { onConnect: Effect.void, onDisconnect: Effect.void },
      }),
    ),
  );
  return { watches, layer };
};

describe('a Connection running another Release', () => {
  it('is relinking, its Release said, until a socket to it is answered', async () => {
    const { watches, layer } = opened();
    const seen = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const links: Array<LinkStatus> = [];
          const mismatches: Array<unknown> = [];
          yield* Effect.forkScoped(
            Stream.runForEach(CodeClients.link('m1'), (link) =>
              Effect.sync(() => void links.push(link)),
            ),
          );
          const said = yield* Effect.forkScoped(
            Stream.runForEach(CodeClients.mismatch('m1'), (mismatch) =>
              Effect.sync(() => void mismatches.push(mismatch)),
            ),
          );
          yield* wait();
          const watch = watches.get('m1')!;
          watch.closed!({
            code: PLUGIN_MISMATCH,
            reason: mismatchReason(HASH),
          });
          yield* wait();
          watch.answered!();
          yield* wait();
          // A reason it cannot read is a mismatch all the same.
          watch.closed!({ code: PLUGIN_MISMATCH, reason: 'newer' });
          yield* wait();
          // Closed another way, it is none.
          watch.closed!({ code: 1006, reason: '' });
          yield* wait();
          yield* Fiber.interrupt(said);
          return { links, mismatches };
        }),
      ).pipe(Effect.provide(layer)),
    );
    expect(seen.links).toEqual([
      'linked',
      'relinking',
      'linked',
      'relinking',
      'linked',
    ]);
    expect(seen.mismatches).toEqual([
      null,
      { running: HASH },
      null,
      { running: null },
      null,
    ]);
  });
});
