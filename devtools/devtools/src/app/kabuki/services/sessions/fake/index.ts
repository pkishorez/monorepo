import { Effect, Layer, Queue, Stream } from 'effect';
import type { KabukiSessionClient } from '@kestack/devtools-kabuki/api';
import type { KabukiSessionSummary } from '@kestack/devtools-kabuki/server';
import { Sessions } from '../contract/index.js';

type List = ReadonlyArray<KabukiSessionSummary>;

const silent = new Proxy({} as KabukiSessionClient, {
  get: (_, method) => () => (method === 'watch' ? Stream.never : Effect.never),
});

export const fakeSessions = Effect.gen(function* () {
  const sockets = yield* Queue.unbounded<Queue.Queue<List | null>>();
  const dialed: Array<string> = [];
  const layer = Layer.succeed(Sessions)({
    watch: Stream.unwrap(
      Effect.gen(function* () {
        const socket = yield* Queue.unbounded<List | null>();
        yield* Queue.offer(sockets, socket);
        return Stream.fromQueue(socket).pipe(
          Stream.takeWhile((list): list is List => list !== null),
        );
      }),
    ),
    dial: (name) => Effect.sync(() => (dialed.push(name), silent)),
  });
  return { sockets, dialed, layer };
});
