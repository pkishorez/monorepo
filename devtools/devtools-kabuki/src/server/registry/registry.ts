import { Clock, Context, Effect, Layer, Stream, SubscriptionRef } from 'effect';
import type { KabukiSessionClient } from '../../api/index.ts';

/*
 * The registry: the Kabuki Sessions live now, in memory only. One is kept
 * while its socket is open; DevTools forgets it when the socket closes.
 *
 * 1. Name    each Kabuki Session under the name it asked for, or that name
 *            with `-2`, `-3` when a live one has it.
 * 2. Keep    add one, remove it, list them, and watch the list change.
 */

/** A live Kabuki Session, and the Api client DevTools asks it through. */
export interface KabukiSession {
  /** Its final name, unique among the live ones. */
  readonly name: string;
  /** Its app: the root Actor's name. */
  readonly app: string;
  /** The page it runs in. */
  readonly url: string;
  /** The page's origin, as its socket said; `null` when it said none, as outside a browser. */
  readonly origin: string | null;
  /** When it connected, in milliseconds. */
  readonly connectedAt: number;
  readonly client: KabukiSessionClient;
}

/** What a Kabuki Session asks to be kept as: its name is the one it wants. */
export type Asked = Omit<KabukiSession, 'connectedAt'>;

// 1. Name
/** `asked`, or `asked-2`, `asked-3`, … : the first no live Kabuki Session has. */
export const unique = (asked: string, taken: ReadonlySet<string>): string => {
  if (!taken.has(asked)) return asked;
  let n = 2;
  while (taken.has(`${asked}-${n}`)) n++;
  return `${asked}-${n}`;
};

// 2. Keep
export class KabukiSessions extends Context.Service<
  KabukiSessions,
  {
    /** Keep a Kabuki Session under a name of its own; answers it as kept. */
    readonly add: (asked: Asked) => Effect.Effect<KabukiSession>;
    /** Forget this Kabuki Session; one kept since under its name stays. */
    readonly remove: (session: KabukiSession) => Effect.Effect<void>;
    /** The live ones, oldest first. */
    readonly list: Effect.Effect<ReadonlyArray<KabukiSession>>;
    readonly find: (name: string) => Effect.Effect<KabukiSession | undefined>;
    /** The live ones now, then again after every change. */
    readonly watch: Stream.Stream<ReadonlyArray<KabukiSession>>;
    /** Done once this Kabuki Session is no longer live. */
    readonly gone: (session: KabukiSession) => Effect.Effect<void>;
  }
>()('@kestack/devtools-kabuki/server/KabukiSessions') {}

export const make = Effect.gen(function* () {
  const live = yield* SubscriptionRef.make<ReadonlyArray<KabukiSession>>([]);
  const watch = SubscriptionRef.changes(live);
  return KabukiSessions.of({
    add: (asked) =>
      Effect.flatMap(Clock.currentTimeMillis, (connectedAt) =>
        SubscriptionRef.modify(live, (sessions) => {
          const session: KabukiSession = {
            ...asked,
            name: unique(asked.name, new Set(sessions.map((one) => one.name))),
            connectedAt,
          };
          return [session, [...sessions, session]];
        }),
      ),
    remove: (session) =>
      SubscriptionRef.update(live, (sessions) =>
        sessions.filter((one) => one !== session),
      ),
    list: SubscriptionRef.get(live),
    find: (name) =>
      Effect.map(SubscriptionRef.get(live), (sessions) =>
        sessions.find((one) => one.name === name),
      ),
    watch,
    gone: (session) =>
      watch.pipe(
        Stream.filter((sessions) => !sessions.includes(session)),
        Stream.runHead,
        Effect.asVoid,
      ),
  });
});

export const layer: Layer.Layer<KabukiSessions> =
  Layer.effect(KabukiSessions)(make);
