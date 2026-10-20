import { Context, Effect, Layer, Stream } from 'effect';
import { TestClock } from 'effect/testing';
import { describe, expect, it } from 'vitest';
import { Api, Browser } from '../../shared/pages/index.ts';
import { apiLayer } from './api.ts';

/*
 * The Api over a Browser whose every socket gives one member update and
 * then ends its stream, as the User Space does at a session's deadline.
 */

const ada = { userId: 'u-ada', email: 'ada@demo', name: 'Ada' };

const counted = () => {
  let opened = 0;
  const browser = Layer.succeed(Browser, {
    signIn: () => Effect.void,
    open: () => Effect.void,
    connect: Effect.sync(() => {
      opened++;
      return {
        client: {
          'Session.watch': () => Stream.make({ ...ada, name: `Ada ${opened}` }),
        } as never,
        subscribe: (open: () => Stream.Stream<unknown, unknown>) => open(),
      } as never;
    }),
  });
  return { browser, opened: () => opened };
};

describe('Api.follow', () => {
  it('follows a stream that ended again, on a socket opened anew', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const { browser, opened } = counted();
        const built = yield* Layer.build(
          apiLayer({
            now: Effect.succeed(ada),
            changes: Stream.make(ada).pipe(Stream.concat(Stream.never)),
          }).pipe(Layer.provide(browser)),
        );
        const api = Context.get(built, Api);
        const seen: Array<string> = [];
        yield* Effect.forkChild(
          Stream.runForEach(
            api.follow((client) => client['Session.watch']()),
            (member) => Effect.sync(() => seen.push(member.name)),
          ),
        );
        for (let tick = 0; tick < 3; tick++) {
          yield* Effect.yieldNow;
          yield* TestClock.adjust('1 second');
        }
        expect(seen.slice(0, 2)).toEqual(['Ada 1', 'Ada 2']);
        expect(opened()).toBeGreaterThanOrEqual(2);
      }).pipe(Effect.scoped, Effect.provide(TestClock.layer())),
    ));
});
