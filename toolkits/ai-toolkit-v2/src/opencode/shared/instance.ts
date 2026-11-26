import {
  Deferred,
  Effect,
  Option,
  Queue,
  Semaphore,
  Stream,
  SubscriptionRef,
} from 'effect';
import {
  type Answer,
  type Event,
  type Live,
  OpenCodeError,
  type Prompt,
  type Request,
  type SessionID,
  type Status,
  type UserMessage,
} from '../contract/index.js';
import type { DriverShape } from './driver.js';
import { Out } from './out.js';
import * as Run from './run.js';

interface State {
  readonly current: Run.Run | undefined;
  readonly queue: ReadonlyArray<Run.Run>;
  readonly requests: ReadonlyArray<Request>;
  readonly steers: ReadonlyArray<UserMessage>;
  readonly delivered: ReadonlyArray<string>;
  readonly cancelled: boolean;
  readonly gone: boolean;
}

export interface Instance {
  readonly submit: (prompt: Prompt) => Effect.Effect<Run.Run>;
  readonly join: (
    message: Prompt,
  ) => Effect.Effect<Option.Option<Run.Run>, OpenCodeError>;
  readonly respond: (
    requestId: string,
    answer: Answer,
  ) => Effect.Effect<void, OpenCodeError>;
  readonly cancel: Effect.Effect<void, OpenCodeError>;
  readonly live: Effect.Effect<Option.Option<Live>>;
  readonly changes: Stream.Stream<Live>;
}

const initial: State = {
  current: undefined,
  queue: [],
  requests: [],
  steers: [],
  delivered: [],
  cancelled: false,
  gone: false,
};

const goneMessage = 'The OpenCode instance is gone';

export const requestIdOf = (request: Request): string =>
  request.type === 'permission.asked' ? request.data.id : request.data.form.id;

const statusOf = (event: Event): Status | undefined =>
  event.type === 'session.execution.succeeded'
    ? 'completed'
    : event.type === 'session.execution.interrupted'
      ? 'cancelled'
      : event.type === 'session.execution.failed'
        ? 'failed'
        : undefined;

const settled = (event: Event): string | undefined =>
  event.type === 'permission.replied'
    ? event.data.requestID
    : event.type === 'form.replied' || event.type === 'form.cancelled'
      ? event.data.id
      : undefined;

export const make = (
  id: SessionID,
  driver: DriverShape,
  release: Effect.Effect<void>,
) =>
  Effect.gen(function* () {
    const state = yield* SubscriptionRef.make(initial);
    const jobs = yield* Queue.unbounded<Run.Run>();
    const gone = yield* Deferred.make<void>();
    const lock = yield* Semaphore.make(1);

    const toLive = (s: State): Live => ({
      id,
      status: s.current === undefined ? 'ready' : 'running',
      queue: s.queue.length,
      requests: s.requests,
    });

    const leave = Effect.gen(function* () {
      const before = yield* SubscriptionRef.getAndUpdate(state, (s) => ({
        ...s,
        gone: true,
        queue: [],
        requests: [],
      }));
      yield* release;
      yield* Effect.forEach(before.queue, (run) =>
        Run.end(run, 'failed', goneMessage),
      );
      yield* Deferred.succeed(gone, undefined);
    });

    yield* Effect.addFinalizer(() => Deferred.succeed(gone, undefined));

    const step =
      (run: Run.Run, user: UserMessage, delivered: { own: boolean }) =>
      (event: Event) =>
        Effect.gen(function* () {
          if (
            event.type === 'permission.asked' ||
            event.type === 'form.created'
          ) {
            yield* SubscriptionRef.update(state, (s) => ({
              ...s,
              requests: [...s.requests, event],
            }));
            yield* Run.emit(run, Out.Requested({ request: event }));
            return true;
          }
          yield* Run.emit(run, Out.Record({ record: event }));
          const answered = settled(event);
          if (answered !== undefined) {
            yield* SubscriptionRef.update(state, (s) => ({
              ...s,
              requests: s.requests.filter(
                (request) => requestIdOf(request) !== answered,
              ),
            }));
          }
          if (event.type === 'session.inbox.delivered') {
            const inboxID: string = event.data.inboxID;
            if (inboxID === user.id) {
              delivered.own = true;
            } else {
              const steer = yield* SubscriptionRef.modify(state, (s) => {
                const found = s.steers.find(
                  (message) => message.id === inboxID,
                );
                return found === undefined
                  ? [undefined, { ...s, delivered: [...s.delivered, inboxID] }]
                  : [
                      found,
                      {
                        ...s,
                        steers: s.steers.filter((message) => message !== found),
                      },
                    ];
              });
              if (steer !== undefined) {
                yield* Run.emit(run, Out.Steered({ message: steer }));
              }
            }
          }
          const status = statusOf(event);
          if (status === undefined) return true;
          return yield* lock.withPermits(1)(
            Effect.gen(function* () {
              const { cancelled, steers } = yield* SubscriptionRef.get(state);
              if (!cancelled && (!delivered.own || steers.length > 0))
                return true;
              yield* Run.end(
                run,
                status,
                event.type === 'session.execution.failed'
                  ? event.data.error.message
                  : undefined,
              );
              return false;
            }),
          );
        });

    const follow = (
      run: Run.Run,
      user: UserMessage,
      events: Stream.Stream<Event, OpenCodeError>,
    ) =>
      Effect.gen(function* () {
        const delivered = { own: false };
        yield* events.pipe(Stream.runForEachWhile(step(run, user, delivered)));
        if (yield* Deferred.isDone(run.done)) return false;
        return yield* new OpenCodeError({
          message: 'The OpenCode event stream ended during the Run',
        });
      }).pipe(
        Effect.catch((error) =>
          leave.pipe(
            Effect.andThen(Run.end(run, 'failed', error.message)),
            Effect.as(true),
          ),
        ),
      );

    const execute = (run: Run.Run) =>
      Effect.scoped(
        Effect.gen(function* () {
          yield* SubscriptionRef.update(state, (s) => ({
            ...s,
            current: run,
            queue: s.queue.filter((queued) => queued !== run),
            cancelled: false,
            steers: [],
            delivered: [],
          }));
          const events = yield* driver.events(id);
          const user = yield* driver.prompt(id, run.prompt);
          return yield* follow(run, user, events);
        }),
      ).pipe(
        Effect.catch((error) => Run.refuse(run, error).pipe(Effect.as(false))),
        Effect.tap(() =>
          SubscriptionRef.update(state, (s) => ({
            ...s,
            current: undefined,
            requests: [],
            steers: [],
            delivered: [],
          })),
        ),
      );

    const loop: Effect.Effect<void> = Queue.take(jobs).pipe(
      Effect.flatMap(execute),
      Effect.flatMap((lost) =>
        lost ? Effect.void : Effect.suspend(() => loop),
      ),
    );
    yield* Effect.forkScoped(loop);

    const instance: Instance = {
      submit: (prompt) =>
        Effect.gen(function* () {
          const run = yield* Run.make(id, prompt);
          const before = yield* SubscriptionRef.modify(state, (s) => [
            s,
            s.gone ? s : { ...s, queue: [...s.queue, run] },
          ]);
          if (before.gone) {
            yield* Run.end(run, 'failed', goneMessage);
            return run;
          }
          const ahead =
            before.queue.length + (before.current === undefined ? 0 : 1);
          if (ahead > 0) {
            yield* Run.emit(run, Out.Queued({ position: ahead }));
          }
          yield* Queue.offer(jobs, run);
          return run;
        }),
      join: (message) =>
        lock.withPermits(1)(
          Effect.gen(function* () {
            const { current, gone: left } = yield* SubscriptionRef.get(state);
            if (
              left ||
              current === undefined ||
              (yield* Deferred.isDone(current.done))
            )
              return Option.none<Run.Run>();
            const user = yield* driver.prompt(id, message, 'steer');
            const seen = yield* SubscriptionRef.modify(state, (s) =>
              s.delivered.includes(user.id)
                ? [true, s]
                : [false, { ...s, steers: [...s.steers, user] }],
            );
            if (seen) yield* Run.emit(current, Out.Steered({ message: user }));
            return Option.some(current);
          }),
        ),
      respond: (requestId, answer) => driver.reply(id, requestId, answer),
      cancel: Effect.gen(function* () {
        const { current } = yield* SubscriptionRef.getAndUpdate(state, (s) =>
          s.current === undefined ? s : { ...s, cancelled: true },
        );
        if (current !== undefined) yield* driver.interrupt(id);
      }),
      live: SubscriptionRef.get(state).pipe(
        Effect.map((s) => (s.gone ? Option.none() : Option.some(toLive(s)))),
      ),
      changes: SubscriptionRef.changes(state).pipe(
        Stream.map(toLive),
        Stream.changesWith(
          (a, b) =>
            a.status === b.status &&
            a.queue === b.queue &&
            a.requests === b.requests,
        ),
        Stream.interruptWhen(Deferred.await(gone)),
      ),
    };
    return instance;
  });
