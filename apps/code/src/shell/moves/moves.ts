import {
  Context,
  Effect,
  Layer,
  PubSub,
  Queue,
  Ref,
  Schema,
  Stream,
  SubscriptionRef,
} from 'effect';
import { AiClient, AiClients } from '@kestack/ai-toolkit/client';
import { orRefused } from '../refusal/index.ts';
import { answered, asking, idle, next, type Plan, put } from './plan.ts';

/*
 * Moves: every Settle and un-Settle the user asks for, whatever asked it:
 * a swipe, its Undo, the Settled List's Un-settle or Session Actions. Each
 * Session's is its own.
 *
 * 1. Put     where the user put it, asked of its Machine at once.
 * 2. Ask     one call at a time for each Session, in order; one put while
 *            a call is in flight is asked once it returns, if it still
 *            differs from what the Machine last took. Each answer is that
 *            call's: a refusal of an earlier put changes nothing, one of
 *            the last drops the Move and says why.
 * 3. Agree   a Move with nothing left to ask goes once the Session as
 *            synced is where the user put it, or HOLD after its last call
 *            returned, whichever is first.
 *
 * `intents` is every Move there is, newest put highest, for the sidebar to
 * draw each Session where it goes.
 */

/**
 * How long a Move with nothing left to ask still draws its Session where
 * it was put, waiting for the synced Session to agree, in ms. Past it the
 * synced Session is drawn as it is: one whose update is late shows where
 * it was for a moment, then where it went, a brief flicker, rather than a
 * row held wrong forever when an update never comes.
 */
export const HOLD = 3000;

/** A Session of a Machine. */
interface Session {
  readonly machineId: string;
  readonly sessionId: string;
}

/** Where a Session goes, and whether anything is left to ask its Machine. */
export const Intent = Schema.Struct({
  machineId: Schema.String,
  sessionId: Schema.String,
  settled: Schema.Boolean,
  /** Its place in the order put, newest highest. */
  n: Schema.Finite,
  /** Nothing in flight nor left to ask: it goes once the synced Session agrees. */
  idle: Schema.Boolean,
});

/** What its Machine refused, and why. */
export interface Refusal {
  readonly settled: boolean;
  readonly reason: string;
}

export class Moves extends Context.Service<
  Moves,
  {
    readonly intents: Stream.Stream<ReadonlyArray<typeof Intent.Type>>;
    readonly refusals: Stream.Stream<Refusal>;
    /** 1. The user put the Session `settled`, or not. */
    readonly put: (session: Session, settled: boolean) => Effect.Effect<void>;
    /** 3. The Session as synced is `settled`. */
    readonly agreed: (
      session: Session,
      settled: boolean,
    ) => Effect.Effect<void>;
  }
>()('code/Moves') {}

const keyOf = ({ machineId, sessionId }: Session) =>
  `${machineId} ${sessionId}`;

/** A Session's Plan; while there is one, its fiber is working through it. */
interface Entry extends Session {
  readonly plan: Plan;
  /** Rung to look again, as the Plan changed while it waited. */
  readonly wake: Queue.Queue<void>;
}

const ask = ({ machineId, sessionId }: Session, settled: boolean) =>
  AiClients.on(
    machineId,
    AiClient.use((api) =>
      settled
        ? api.settleSession({ sessionId })
        : api.unsettleSession({ sessionId }),
    ),
  );

const make = Effect.gen(function* () {
  const scope = yield* Effect.scope;
  const clients = yield* Effect.context<AiClients>();
  const entries = yield* Ref.make(new Map<string, Entry>());
  const intents = yield* SubscriptionRef.make<
    ReadonlyArray<typeof Intent.Type>
  >([]);
  const refusals = yield* PubSub.unbounded<Refusal>();
  let count = 0;

  const show = Effect.flatMap(Ref.get(entries), (now) =>
    SubscriptionRef.set(
      intents,
      [...now.values()].map(({ machineId, sessionId, plan }) => ({
        machineId,
        sessionId,
        settled: plan.settled,
        n: plan.n,
        idle: idle(plan),
      })),
    ),
  );

  // Changes a Session's Plan; null drops its Move.
  const change = (key: string, plan: (plan: Plan) => Plan | null) =>
    Ref.update(entries, (all) => {
      const entry = all.get(key);
      if (entry === undefined) return all;
      const changed = plan(entry.plan);
      const next = new Map(all);
      if (changed === null) next.delete(key);
      else next.set(key, { ...entry, plan: changed });
      return next;
    });

  // Drops the Move and stops, if it is still idle and `done` says so.
  const finish = (key: string, done: (entry: Entry) => boolean) =>
    Ref.modify(entries, (all) => {
      const entry = all.get(key);
      if (entry === undefined) return [true, all] as const;
      if (!idle(entry.plan) || !done(entry)) return [false, all] as const;
      const without = new Map(all);
      without.delete(key);
      return [true, without] as const;
    });

  // 2. Ask, 3. Agree: one fiber per Session works its Plan through, the
  // only one that drops its Move.
  const drive = (key: string): Effect.Effect<void> =>
    Effect.gen(function* () {
      while (true) {
        const entry = (yield* Ref.get(entries)).get(key);
        if (entry === undefined) return;
        const step = next(entry.plan);
        if (step === 'idle') {
          if (yield* finish(key, ({ plan }) => plan.agreed)) return yield* show;
          const woken = yield* Effect.raceFirst(
            Effect.as(Effect.sleep(HOLD), false),
            Effect.as(Queue.take(entry.wake), true),
          );
          if (!woken && (yield* finish(key, () => true))) return yield* show;
          continue;
        }
        const settled = entry.plan.settled;
        yield* change(key, asking);
        yield* show;
        const ended = yield* orRefused(ask(entry, settled), () => ({
          _tag: 'Took' as const,
        })).pipe(Effect.provide(clients));
        const took = ended._tag === 'Took';
        const last = (yield* Ref.get(entries)).get(key)?.plan.settled;
        yield* change(key, (plan) => answered(plan, settled, took));
        if (ended._tag === 'Refused' && last === settled)
          yield* PubSub.publish(refusals, { settled, reason: ended.reason });
        yield* show;
      }
    });

  // 1. Put: the Plan changes, and its fiber looks again, or starts.
  const putting = (session: Session, settled: boolean): Effect.Effect<void> =>
    Effect.gen(function* () {
      const key = keyOf(session);
      const fresh = yield* Queue.unbounded<void>();
      const n = ++count;
      const start = yield* Ref.modify(entries, (all) => {
        const was = all.get(key);
        const entry: Entry = {
          ...session,
          plan: put(was?.plan, settled, n),
          wake: was?.wake ?? fresh,
        };
        return [was === undefined, new Map(all).set(key, entry)] as const;
      });
      yield* show;
      const entry = (yield* Ref.get(entries)).get(key)!;
      if (start) yield* Effect.forkIn(drive(key), scope);
      else yield* Queue.offer(entry.wake, undefined);
    });

  // 3. Agree
  const agreed = (session: Session, settled: boolean) =>
    Effect.gen(function* () {
      const key = keyOf(session);
      yield* change(key, (plan) =>
        idle(plan) && plan.settled === settled
          ? { ...plan, agreed: true }
          : plan,
      );
      const entry = (yield* Ref.get(entries)).get(key);
      if (entry !== undefined) yield* Queue.offer(entry.wake, undefined);
    });

  return Moves.of({
    intents: SubscriptionRef.changes(intents),
    refusals: Stream.fromPubSub(refusals),
    put: putting,
    agreed,
  });
});

/** The Moves of the Machines reached here. */
export const layer: Layer.Layer<Moves, never, AiClients> = Layer.effect(
  Moves,
  make,
);
