import { Effect, Layer, Queue, Stream } from 'effect';
import { KabukiSession } from '@kestack/devtools-kabuki/devtools';
import type {
  KabukiSessionCalls,
  KabukiSessionSummary,
} from '@kestack/devtools-kabuki/devtools';
import { Sessions } from '../contract/index.js';

type List = ReadonlyArray<KabukiSessionSummary>;

const silent = new Proxy({} as KabukiSessionCalls, {
  get: (_, call) => () =>
    call === 'watch' || call === 'fakes' ? Stream.never : Effect.never,
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
    session: (name) =>
      Layer.effect(KabukiSession)(
        Effect.sync(() => (dialed.push(name), silent)),
      ),
  });
  return { sockets, dialed, layer };
});
