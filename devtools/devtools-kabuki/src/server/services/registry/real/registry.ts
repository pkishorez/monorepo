import { Clock, Effect, Layer, Stream, SubscriptionRef } from 'effect';
import { Registry } from '../contract/index.ts';
import type { Registered } from '../contract/index.ts';

export const unique = (asked: string, taken: ReadonlySet<string>): string => {
  if (!taken.has(asked)) return asked;
  let n = 2;
  while (taken.has(`${asked}-${n}`)) n++;
  return `${asked}-${n}`;
};

const make = Effect.gen(function* () {
  const live = yield* SubscriptionRef.make<ReadonlyArray<Registered>>([]);
  const watch = SubscriptionRef.changes(live);
  let ids = 0;
  const same = (session: Registered) => (one: Registered) =>
    one.id === session.id;
  return Registry.of({
    add: (asked) =>
      Effect.flatMap(Clock.currentTimeMillis, (connectedAt) =>
        SubscriptionRef.modify(live, (sessions) => {
          const session: Registered = {
            ...asked,
            id: ++ids,
            name: unique(asked.name, new Set(sessions.map((one) => one.name))),
            connectedAt,
          };
          return [session, [...sessions, session]];
        }),
      ),
    moved: (session, url) =>
      SubscriptionRef.update(live, (sessions) =>
        sessions.map((one) =>
          same(session)(one) && one.url !== url ? { ...one, url } : one,
        ),
      ),
    remove: (session) =>
      SubscriptionRef.update(live, (sessions) =>
        sessions.filter((one) => !same(session)(one)),
      ),
    list: SubscriptionRef.get(live),
    find: (name) =>
      Effect.map(SubscriptionRef.get(live), (sessions) =>
        sessions.find((one) => one.name === name),
      ),
    watch,
    gone: (session) =>
      watch.pipe(
        Stream.filter((sessions) => !sessions.some(same(session))),
        Stream.runHead,
        Effect.asVoid,
      ),
  });
});

export const registryLayer: Layer.Layer<Registry> =
  Layer.effect(Registry)(make);
