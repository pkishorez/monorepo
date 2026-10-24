import {
  Clock,
  Context,
  Effect,
  Layer,
  PubSub,
  Queue,
  Ref,
  Schema,
  Semaphore,
  Stream,
  SubscriptionRef,
} from 'effect';
import { AiClient, AiClients } from '@kestack/ai-toolkit/client';
import { DeviceState } from '../../layer/capabilities/index.ts';
import { orRefused } from '../refusal/index.ts';
import {
  answered,
  asking,
  hurried,
  idle,
  kept,
  next,
  type Plan,
  put,
  WINDOW,
} from './plan.ts';

/*
 * Moves: every Settle and un-Settle the user asks for, whatever asked it,
 * on its way to the Session's Machine. Each Session's is its own.
 *
 * 1. Put      a swipe, or its Undo, waits WINDOW before its Machine is
 *             asked, so an Undo inside it asks nothing; a button or Session
 *             Actions is asked at once. Either replaces what was waiting.
 *             Kept in Device State as a Pending Move before it returns.
 * 2. Ask      one call at a time for each Session; one put meanwhile is
 *             asked after it lands, if it still differs. A refusal drops
 *             the Move and says why.
 * 3. Hurry    as the page goes, everything waiting is asked at once.
 * 4. Replay   as it starts, every Pending Move kept is asked again: a page
 *             closed or discarded first loses none.
 * 5. Agree    a Move with nothing left to ask goes once the Session as
 *             synced is where the user put it.
 *
 * `intents` is every Move there is, newest put highest, for the sidebar to
 * draw each Session where it goes.
 */

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
  /** Nothing waits nor is asked: it goes once the synced Session agrees. */
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
    /** 1. A swipe, or its Undo: asked once its window closes. */
    readonly swipe: (session: Session, settled: boolean) => Effect.Effect<void>;
    /** 1. A button, or Session Actions: asked at once. */
    readonly set: (session: Session, settled: boolean) => Effect.Effect<void>;
    /** 3. The page is going. */
    readonly hurry: Effect.Effect<void>;
    /** 5. The Session as synced is `settled`. */
    readonly agreed: (
      session: Session,
      settled: boolean,
    ) => Effect.Effect<void>;
  }
>()('code/Moves') {}

const keyOf = ({ machineId, sessionId }: Session) =>
  `${machineId} ${sessionId}`;

/** A Session's Plan, and whether a fiber is working through it. */
interface Entry extends Session {
  readonly plan: Plan;
  readonly driving: boolean;
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
  const store = yield* DeviceState;
  const entries = yield* Ref.make(new Map<string, Entry>());
  const intents = yield* SubscriptionRef.make<
    ReadonlyArray<typeof Intent.Type>
  >([]);
  const refusals = yield* PubSub.unbounded<Refusal>();
  const writing = yield* Semaphore.make(1);
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

  // Device State keeps what the Plan says now, one write at a time, so a
  // later write never lands before an earlier one.
  const keep = (session: Session) =>
    writing.withPermit(
      Effect.flatMap(Ref.get(entries), (now) =>
        store
          .setMove(
            session.machineId,
            session.sessionId,
            kept(now.get(keyOf(session))?.plan),
          )
          .pipe(Effect.ignore),
      ),
    );

  const change = (key: string, plan: (entry: Entry) => Plan) =>
    Ref.update(entries, (now) => {
      const entry = now.get(key);
      if (entry === undefined) return now;
      return new Map(now).set(key, { ...entry, plan: plan(entry) });
    });

  // 2. Ask: one fiber per Session works its Plan through, waiting while it
  // is due later, until nothing is left to ask.
  const drive = (key: string): Effect.Effect<void> =>
    Effect.gen(function* () {
      while (true) {
        const entry = (yield* Ref.get(entries)).get(key);
        if (entry === undefined) return;
        const now = yield* Clock.currentTimeMillis;
        const step = next(entry.plan, now);
        if (step === 'idle' || step === 'asking') {
          // Done, unless the Plan changed since it was read.
          const done = yield* Ref.modify(entries, (all) => {
            const current = all.get(key);
            if (current === undefined) return [true, all];
            if (!idle(current.plan)) return [false, all];
            return [
              true,
              new Map(all).set(key, { ...current, driving: false }),
            ] as const;
          });
          if (done) return;
          continue;
        }
        if (step !== 'ask') {
          yield* Effect.raceFirst(
            Effect.sleep(step.ms),
            Queue.take(entry.wake),
          );
          continue;
        }
        const settled = entry.plan.settled;
        yield* change(key, (current) => asking(current.plan));
        yield* show;
        const ended = yield* orRefused(ask(entry, settled), () => ({
          _tag: 'Asked' as const,
        })).pipe(Effect.provide(clients));
        if (ended._tag === 'Refused') {
          yield* Ref.update(entries, (all) => {
            const without = new Map(all);
            without.delete(key);
            return without;
          });
          yield* PubSub.publish(refusals, { settled, reason: ended.reason });
        } else {
          yield* change(key, (current) => answered(current.plan, settled));
        }
        yield* keep(entry);
        yield* show;
      }
    });

  // 1. Put: the Plan changes, is kept, and its fiber looks again, or starts.
  const putting =
    (wait: number) =>
    (session: Session, settled: boolean): Effect.Effect<void> =>
      Effect.gen(function* () {
        const key = keyOf(session);
        const now = yield* Clock.currentTimeMillis;
        const wake = yield* Queue.unbounded<void>();
        const n = ++count;
        const start = yield* Ref.modify(entries, (all) => {
          const was = all.get(key);
          const entry: Entry = {
            ...session,
            plan: put(was?.plan, settled, n, now, wait),
            driving: true,
            wake: was?.wake ?? wake,
          };
          return [was?.driving !== true, new Map(all).set(key, entry)] as const;
        });
        yield* keep(session);
        yield* show;
        const entry = (yield* Ref.get(entries)).get(key)!;
        if (start) yield* Effect.forkIn(drive(key), scope);
        else yield* Queue.offer(entry.wake, undefined);
      });

  // 3. Hurry
  const hurry = Effect.gen(function* () {
    yield* Ref.update(
      entries,
      (all) =>
        new Map(
          [...all].map(([key, entry]) => [
            key,
            { ...entry, plan: hurried(entry.plan) },
          ]),
        ),
    );
    for (const entry of (yield* Ref.get(entries)).values())
      yield* Queue.offer(entry.wake, undefined);
  });

  // 5. Agree
  const agreed = (session: Session, settled: boolean) =>
    Effect.andThen(
      Ref.update(entries, (all) => {
        const entry = all.get(keyOf(session));
        if (
          entry === undefined ||
          entry.driving ||
          !idle(entry.plan) ||
          entry.plan.settled !== settled
        )
          return all;
        const without = new Map(all);
        without.delete(keyOf(session));
        return without;
      }),
      show,
    );

  // 4. Replay: what Device State kept is asked at once.
  const { moves } = yield* DeviceState.read;
  for (const [machineId, sessions] of Object.entries(moves))
    for (const [sessionId, settled] of Object.entries(sessions))
      yield* putting(0)({ machineId, sessionId }, settled);

  return Moves.of({
    intents: SubscriptionRef.changes(intents),
    refusals: Stream.fromPubSub(refusals),
    swipe: putting(WINDOW),
    set: putting(0),
    hurry,
    agreed,
  });
});

/** The Moves of the Machines reached here, kept in Device State. */
export const layer: Layer.Layer<Moves, never, AiClients | DeviceState> =
  Layer.effect(Moves, make);

export { WINDOW };
