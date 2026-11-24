import { Effect, Layer, Queue, Stream } from 'effect';
import type { KabukiSessionClient } from '@kestack/devtools-kabuki/api';
import type { KabukiSessionSummary } from '@kestack/devtools-kabuki/server';
import { Sessions } from '../contract/index.js';

/*
 * A DevTools Server a test drives: each watch is a socket the test may
 * close, and each Kabuki Session dialed is written down and never answers.
 */

type List = ReadonlyArray<KabukiSessionSummary>;

/** A Kabuki Session's Api that never answers: the Inspector waits on it. */
const silent = new Proxy({} as KabukiSessionClient, {
  get: (_, method) => () => (method === 'watch' ? Stream.never : Effect.never),
});

/**
 * The Layer, the sockets in the order they were watched, each taking a
 * list to send or `null` to close it, and the names dialed so far.
 */
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
