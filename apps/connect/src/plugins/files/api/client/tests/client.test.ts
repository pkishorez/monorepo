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
import { FileMissing, FileTicket } from '../../contract/index.js';
import {
  FilesAddress,
  FilesClient,
  FilesClients,
  ticketUrlAt,
} from '../client.js';

/*
 * An App calls the files Plugin on each Connection over that Connection's
 * own socket, its Link read as the code Plugin's is, and turns a File
 * Ticket's path into a URL a browser opens from anywhere.
 */

const HASH = 'b'.repeat(64);
const TICKET = `/files/public/${'a'.repeat(64)}/chart.png`;

const wait = (ms = 20) =>
  Effect.promise(() => new Promise((done) => setTimeout(done, ms)));

const ticketOf = (connectionId: string): FileTicket => ({
  path: `/${connectionId}/chart.png`,
  name: 'chart.png',
  kind: 'image',
  mime: 'image/png',
  size: 3,
  url: TICKET,
  expiresAt: 0,
});

/** Every Connection's socket always open, its `requestFile` answering for that Connection alone. */
const opened = () => {
  const watches = new Map<string, SocketWatch>();
  const opens: Array<string> = [];
  const layer = FilesClients.make((connectionId, watch) =>
    Layer.mergeAll(
      Layer.effectDiscard(
        Effect.sync(() => {
          watches.set(connectionId, watch);
          opens.push(connectionId);
        }),
      ),
      Layer.mock(FilesClient)({
        requestFile: (({ path }: { readonly path: string }) =>
          path === 'chart.png'
            ? Effect.succeed(ticketOf(connectionId))
            : Effect.fail(
                new FileMissing({ path: `/${connectionId}/${path}` }),
              )) as FilesClient['Service']['requestFile'],
      }),
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
  return { watches, opens, layer };
};

const requestFile = (path: string) =>
  Effect.flatMap(FilesClient, (api) => api.requestFile({ base: '/', path }));

describe('FilesClients', () => {
  it('calls each Connection over its own socket, opened once while held', async () => {
    const { opens, layer } = opened();
    const seen = await Effect.runPromise(
      Effect.gen(function* () {
        const m1 = yield* FilesClients.on('m1', requestFile('chart.png'));
        const again = yield* FilesClients.on('m1', requestFile('chart.png'));
        const m2 = yield* FilesClients.on('m2', requestFile('chart.png'));
        const missing = yield* Effect.flip(
          FilesClients.on('m2', requestFile('gone.png')),
        );
        return { m1, again, m2, missing };
      }).pipe(Effect.provide(layer)),
    );
    expect(seen.m1.path).toBe('/m1/chart.png');
    expect(seen.again.path).toBe('/m1/chart.png');
    expect(seen.m2.path).toBe('/m2/chart.png');
    expect(seen.missing).toEqual(new FileMissing({ path: '/m2/gone.png' }));
    expect(opens).toEqual(['m1', 'm2']);
  });

  it('is relinking while a Connection runs another Release', async () => {
    const { watches, layer } = opened();
    const links = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const links: Array<string> = [];
          const read = yield* Effect.forkScoped(
            Stream.runForEach(FilesClients.link('m1'), (link) =>
              Effect.sync(() => void links.push(link)),
            ),
          );
          yield* wait();
          watches.get('m1')!.closed!({
            code: PLUGIN_MISMATCH,
            reason: mismatchReason(HASH),
          });
          yield* wait();
          watches.get('m1')!.answered!();
          yield* wait();
          yield* Fiber.interrupt(read);
          return links;
        }),
      ).pipe(Effect.provide(layer)),
    );
    expect(links).toEqual(['linked', 'relinking', 'linked']);
  });
});

describe('a File Ticket opened from anywhere', () => {
  it.each([
    [
      `wss://abc.trycloudflare.com/files/${HASH}/rpc`,
      `https://abc.trycloudflare.com${TICKET}`,
    ],
    [`ws://127.0.0.1:4000/files/${HASH}/rpc`, `http://127.0.0.1:4000${TICKET}`],
    [
      `https://abc.trycloudflare.com/files/${HASH}/rpc`,
      `https://abc.trycloudflare.com${TICKET}`,
    ],
    [`/files/${HASH}/rpc`, TICKET],
  ])('at %s is %s', (socketUrl, url) => {
    expect(ticketUrlAt(socketUrl, TICKET)).toBe(url);
  });

  it('is at the address FilesAddress gives the Connection', async () => {
    const url = await Effect.runPromise(
      FilesAddress.ticketUrl('m1', TICKET).pipe(
        Effect.provide(
          Layer.succeed(FilesAddress, {
            of: (connectionId) =>
              Effect.succeed({
                url: `https://${connectionId}.example.com/files/${HASH}/rpc`,
                key: 'k',
              }),
          }),
        ),
      ),
    );
    expect(url).toBe(`https://m1.example.com${TICKET}`);
  });
});
