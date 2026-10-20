import { Clock, Context, Effect, Layer, Queue, Stream } from 'effect';
import { nextUlid } from '@kestack/std-toolkit/core';
import {
  isFinished,
  type Run,
  RunError,
  type RunKind,
  type RunResult,
  type RunStatus,
  type RunTrigger,
  type RunUpdate,
} from '../../../../shared/contracts/run/index.ts';
import { RunnerHost } from '../../services/runner-host/index.ts';
import { Storage, type StoredRun } from '../../services/storage/index.ts';

/*
 * The life of a run, from the moment it is asked for to the moment it ends.
 *
 * Runs take turns in lanes: a project's stage runs one run at a time, and a
 * run asked for while another runs waits; a newer one replaces the one
 * waiting, which is cancelled. An Inspect before a project exists has a lane
 * of its own. A run starts with its container, and ends when its runner says
 * how it ended, when its owner cancels it before it starts, when the runner
 * stops reporting (Lost, after `silenceLimitMs`), or when it runs past
 * `timeoutMs`. Whichever way it ends, its container is stopped and the next
 * run in its lane starts.
 *
 * Time is kept on the object's alarm, which wakes a hibernated object:
 * every runner call moves the run's silence deadline on.
 */

export interface EnqueueInput {
  /** The project it runs for; null or absent for an Inspect before one exists. */
  readonly projectId?: string | null;
  readonly stage: string;
  readonly kind: RunKind;
  /** The full SHA of the commit to run. */
  readonly commit: string;
  readonly trigger: RunTrigger;
  readonly spec: {
    readonly connectionId: string;
    /** `owner/name`. */
    readonly repo: string;
    /** From the repository's root; `.` for the root. */
    readonly folder: string;
    readonly setupCommand: string | null;
    /** Inside `folder`; `alchemy.run.ts` when absent. */
    readonly entrypoint?: string;
    /** Provider → credentialId; none for an Inspect. */
    readonly credentials?: Readonly<Record<string, string>>;
  };
}

/** What a later task does once a run has ended. */
export type FinishedHandler = (run: Run) => Effect.Effect<void>;

/** The alarm the lifecycle shares with the object's other waits. */
export interface Alarm {
  readonly getAlarm: () => Promise<number | null>;
  readonly setAlarm: (at: number) => Promise<void>;
}

export interface LifecycleConfig {
  /** How long a runner may go unheard before its run is Lost. */
  readonly silenceLimitMs: number;
  /** How long a run may take. */
  readonly timeoutMs: number;
  readonly alarm: Alarm;
}

export const SILENCE_LIMIT_MS = 5 * 60 * 1000;
export const TIMEOUT_MS = 30 * 60 * 1000;

/** What the owner's tabs see of a stored run. */
export const viewOf = (run: StoredRun): Run => ({
  runId: run.runId,
  projectId: run.projectId,
  stage: run.stage,
  kind: run.kind,
  commit: run.commit,
  trigger: run.trigger,
  status: run.status,
  repo: run.repo,
  folder: run.folder,
  cancelRequested: run.cancelRequested,
  queuedAt: run.queuedAt,
  startedAt: run.startedAt,
  finishedAt: run.finishedAt,
  result: run.result,
});

const notFound = new RunError({
  reason: 'not-found',
  message: 'There is no such run.',
});

const over = new RunError({
  reason: 'finished',
  message: 'That run has ended.',
});

const statusOf = (result: RunResult): RunStatus => {
  switch (result._tag) {
    case 'Succeeded':
      return 'succeeded';
    case 'Failed':
      return 'failed';
    case 'Cancelled':
      return 'cancelled';
  }
};

const laneOf = (runId: string, input: EnqueueInput) =>
  input.projectId ? `stage:${input.projectId}:${input.stage}` : `run:${runId}`;

export class RunLifecycle extends Context.Service<
  RunLifecycle,
  {
    /** Asks for a run; answers its ID. It starts at once unless its lane is busy. */
    readonly enqueue: (input: EnqueueInput) => Effect.Effect<string>;
    /** Calls `handler` with each run that ends, however it ends. */
    readonly onFinished: (handler: FinishedHandler) => Effect.Effect<void>;
    /** Ends a waiting run at once; asks a running one to stop. */
    readonly cancel: (runId: string) => Effect.Effect<void, RunError>;
    /** The run, its events and logs so far, then each change, until it ends. */
    readonly watch: (runId: string) => Stream.Stream<RunUpdate, RunError>;
    /** The alarm rang at `now`: ends the runs that went silent or ran too long. */
    readonly check: (now: number) => Effect.Effect<void>;
    /** A running run, as its runner may speak for it; refused once it ends. */
    readonly active: (runId: string) => Effect.Effect<StoredRun, RunError>;
    /** The runner spoke: the run's silence deadline moves on. */
    readonly heard: (runId: string) => Effect.Effect<void, RunError>;
    /** Keeps step `seq` once; refuses one that skips a number. */
    readonly report: (
      runId: string,
      seq: number,
      write: (at: number) => Effect.Effect<void>,
      kind: 'event' | 'log',
    ) => Effect.Effect<void, RunError>;
    /** The runner says how the run ended. */
    readonly finish: (
      runId: string,
      result: RunResult,
    ) => Effect.Effect<void, RunError>;
    /** Done when the run's owner asks it to stop; fails when the run is over. */
    readonly cancelled: (runId: string) => Stream.Stream<'cancel', RunError>;
  }
>()('alchemy-console/UserSpace/RunLifecycle') {
  static readonly layer = (config: LifecycleConfig) =>
    Layer.effect(
      RunLifecycle,
      Effect.gen(function* () {
        const storage = yield* Storage;
        const host = yield* RunnerHost;
        const runs = storage.runs;
        const handlers: Array<FinishedHandler> = [];

        /** Rings the alarm by `at`, unless it rings sooner already. */
        const wakeBy = (at: number) =>
          Effect.promise(async () => {
            const set = await config.alarm.getAlarm();
            if (set === null || set > at) await config.alarm.setAlarm(at);
          });

        /** When a running run is due to be checked again. */
        const dueAt = (run: StoredRun) =>
          Math.min(
            (run.lastHeardAt ?? run.startedAt ?? run.queuedAt) +
              config.silenceLimitMs,
            (run.startedAt ?? run.queuedAt) + config.timeoutMs,
          );

        /** Ends `runId` as `status` with `result`, stops its container, and starts its lane's next run. Inside the lock. */
        const end = (
          runId: string,
          status: RunStatus,
          result: RunResult,
        ): Effect.Effect<ReadonlyArray<StoredRun>> =>
          Effect.gen(function* () {
            const found = yield* runs.get(runId);
            if (found === null || isFinished(found.status)) return [];
            const now = yield* Clock.currentTimeMillis;
            const ended = yield* runs.put({
              ...found,
              status,
              result,
              finishedAt: now,
            });
            if (found.status !== 'queued') yield* host.stop(runId);
            const ending: Array<StoredRun> = [ended];
            const lane = yield* runs.lanes.get(found.lane);
            if (lane?.current === runId) {
              yield* runs.lanes.put({
                lane: found.lane,
                current: lane.waiting,
                waiting: null,
              });
              if (lane.waiting !== null)
                ending.push(...(yield* start(lane.waiting)));
            } else if (lane?.waiting === runId) {
              yield* runs.lanes.put({ ...lane, waiting: null });
            }
            return ending;
          });

        /** Starts `runId`'s container. Inside the lock; answers the runs that ended, if it could not. */
        const start = (
          runId: string,
        ): Effect.Effect<ReadonlyArray<StoredRun>> =>
          Effect.gen(function* () {
            const found = yield* runs.get(runId);
            if (found === null || found.status !== 'queued') return [];
            const now = yield* Clock.currentTimeMillis;
            const started = yield* runs.put({
              ...found,
              status: 'inspecting',
              startedAt: now,
              lastHeardAt: now,
            });
            // Armed before the container is asked for, so a run whose start
            // never answers is still found silent.
            yield* wakeBy(dueAt(started));
            const failure = yield* host
              .start({ runId })
              .pipe(Effect.flip, Effect.option);
            if (failure._tag === 'Some')
              return yield* end(runId, 'failed', {
                _tag: 'Failed',
                message: `The run’s container didn’t start: ${failure.value.message}`,
              });
            return [];
          });

        /** Tells every handler of each run that ended. Outside the lock. */
        const tell = (ended: ReadonlyArray<StoredRun>) =>
          Effect.forEach(
            ended,
            (run) =>
              Effect.forEach(handlers, (handle) =>
                handle(viewOf(run)).pipe(Effect.ignoreCause({ log: true })),
              ),
            { discard: true },
          );

        const active = (runId: string) =>
          Effect.gen(function* () {
            const found = yield* runs.get(runId);
            if (found === null) return yield* notFound;
            if (isFinished(found.status)) return yield* over;
            if (found.status === 'queued')
              return yield* new RunError({
                reason: 'invalid',
                message: 'That run hasn’t started.',
              });
            return found;
          });

        const touch = (run: StoredRun) =>
          Effect.gen(function* () {
            const now = yield* Clock.currentTimeMillis;
            const heard = yield* runs.put({ ...run, lastHeardAt: now });
            yield* wakeBy(dueAt(heard));
            return heard;
          });

        /**
         * Runs `effect` under the lock, to the end: a caller that goes away
         * (a dropped socket) never leaves a run ended with its lane stuck.
         */
        const locked = <A, E>(effect: Effect.Effect<A, E>) =>
          Effect.uninterruptible(runs.exclusively(effect));

        /** Runs `effect` under the lock, then tells of the runs it ended, all to the end. */
        const settle = <E>(
          effect: Effect.Effect<ReadonlyArray<StoredRun>, E>,
        ) =>
          Effect.uninterruptible(
            Effect.flatMap(runs.exclusively(effect), (ended) => tell(ended)),
          );

        /** Once now, then each time anything of `runId` is written: subscribed before the first. */
        const wakes = (runId: string) =>
          Stream.unwrap(
            Effect.gen(function* () {
              const queue = yield* Queue.unbounded<void>();
              yield* Effect.forkScoped(
                Stream.runForEach(runs.touched(runId), () =>
                  Queue.offer(queue, undefined),
                ),
              );
              yield* Effect.yieldNow;
              yield* Queue.offer(queue, undefined);
              return Stream.fromQueue(queue);
            }),
          );

        return RunLifecycle.of({
          enqueue: (input) =>
            Effect.gen(function* () {
              const runId = yield* nextUlid;
              const now = yield* Clock.currentTimeMillis;
              const lane = laneOf(runId, input);
              yield* settle(
                Effect.gen(function* () {
                  yield* runs.put({
                    runId,
                    projectId: input.projectId ?? null,
                    stage: input.stage,
                    kind: input.kind,
                    commit: input.commit,
                    trigger: input.trigger,
                    status: 'queued',
                    repo: input.spec.repo,
                    folder: input.spec.folder,
                    cancelRequested: false,
                    queuedAt: now,
                    startedAt: null,
                    finishedAt: null,
                    result: null,
                    connectionId: input.spec.connectionId,
                    setupCommand: input.spec.setupCommand,
                    entrypoint: input.spec.entrypoint ?? 'alchemy.run.ts',
                    credentials: { ...input.spec.credentials },
                    lane,
                    lastHeardAt: null,
                    lastEventSeq: 0,
                    lastLogSeq: 0,
                  });
                  const busy = yield* runs.lanes.get(lane);
                  if (busy === null || busy.current === null) {
                    yield* runs.lanes.put({
                      lane,
                      current: runId,
                      waiting: null,
                    });
                    return yield* start(runId);
                  }
                  // The newest waiting commit replaces the one waiting.
                  const replaced =
                    busy.waiting === null
                      ? []
                      : yield* end(busy.waiting, 'cancelled', {
                          _tag: 'Cancelled',
                        });
                  yield* runs.lanes.put({ ...busy, waiting: runId });
                  return replaced;
                }),
              );
              return runId;
            }),
          onFinished: (handler) =>
            Effect.sync(() => void handlers.push(handler)),
          cancel: (runId) =>
            Effect.gen(function* () {
              yield* settle(
                Effect.gen(function* () {
                  const found = yield* runs.get(runId);
                  if (found === null) return yield* notFound;
                  if (isFinished(found.status)) return yield* over;
                  if (found.status === 'queued')
                    return yield* end(runId, 'cancelled', {
                      _tag: 'Cancelled',
                    });
                  yield* runs.put({ ...found, cancelRequested: true });
                  return [];
                }),
              );
            }),
          watch: (runId) =>
            Stream.unwrap(
              Effect.gen(function* () {
                if ((yield* runs.get(runId)) === null) return yield* notFound;
                // Each wake reads everything newer than what this watcher
                // was sent, so a change it missed is read on the next one.
                let sentEvents = 0;
                let sentLogs = 0;
                let sentRun = '';
                const read = Effect.gen(function* () {
                  const run = (yield* runs.get(runId))!;
                  const view = viewOf(run);
                  const updates: Array<RunUpdate> = [];
                  const first = sentRun === '';
                  const runChanged = JSON.stringify(view) !== sentRun;
                  if (first) updates.push({ _tag: 'Run', run: view });
                  const events = yield* runs.events.after(runId, sentEvents);
                  if (events.length > 0) {
                    sentEvents = events.at(-1)!.seq;
                    updates.push({
                      _tag: 'Events',
                      events: events.map(({ key: _key, ...event }) => event),
                    });
                  }
                  const logs = yield* runs.logs.after(runId, sentLogs);
                  if (logs.length > 0) {
                    sentLogs = logs.at(-1)!.seq;
                    updates.push({
                      _tag: 'Logs',
                      logs: logs.map(({ key: _key, ...log }) => log),
                    });
                  }
                  // A run's last word comes after its last step.
                  if (!first && runChanged)
                    updates.push({ _tag: 'Run', run: view });
                  sentRun = JSON.stringify(view);
                  return { updates, ended: isFinished(run.status) };
                });
                return wakes(runId).pipe(
                  Stream.mapEffect(() => read),
                  Stream.takeUntil(({ ended }) => ended),
                  Stream.flatMap(({ updates }) => Stream.fromIterable(updates)),
                );
              }),
            ),
          check: (now) =>
            Effect.gen(function* () {
              yield* settle(
                Effect.gen(function* () {
                  const ending: Array<StoredRun> = [];
                  let next = Infinity;
                  for (const lane of yield* runs.lanes.all) {
                    if (lane.current === null) continue;
                    const run = yield* runs.get(lane.current);
                    if (run === null || run.status === 'queued') continue;
                    if (isFinished(run.status)) continue;
                    const heard = run.lastHeardAt ?? run.startedAt ?? now;
                    if (heard + config.silenceLimitMs <= now)
                      ending.push(
                        ...(yield* end(run.runId, 'lost', {
                          _tag: 'Failed',
                          message: `The runner stopped reporting for ${Math.round(config.silenceLimitMs / 60_000) || 1} minutes.`,
                        })),
                      );
                    else if ((run.startedAt ?? now) + config.timeoutMs <= now)
                      ending.push(
                        ...(yield* end(run.runId, 'failed', {
                          _tag: 'Failed',
                          message: `The run took longer than ${Math.round(config.timeoutMs / 60_000) || 1} minutes.`,
                        })),
                      );
                    else next = Math.min(next, dueAt(run));
                  }
                  // Runs started by the ends above set their own alarms.
                  if (next !== Infinity) yield* wakeBy(next);
                  return ending;
                }),
              );
            }),
          active,
          heard: (runId) =>
            locked(
              Effect.gen(function* () {
                const run = yield* active(runId);
                yield* touch(run);
              }),
            ),
          report: (runId, seq, write, kind) =>
            locked(
              Effect.gen(function* () {
                const run = yield* active(runId);
                const last =
                  kind === 'event' ? run.lastEventSeq : run.lastLogSeq;
                // Sent again after a dropped socket: kept already.
                if (seq <= last) return yield* touch(run);
                if (seq !== last + 1)
                  return yield* new RunError({
                    reason: 'invalid',
                    message: `Step ${seq} came before step ${last + 1}.`,
                  });
                const now = yield* Clock.currentTimeMillis;
                yield* write(now);
                yield* runs.put({
                  ...run,
                  lastHeardAt: now,
                  ...(kind === 'event'
                    ? { lastEventSeq: seq }
                    : { lastLogSeq: seq }),
                });
              }),
            ),
          finish: (runId, result) =>
            Effect.gen(function* () {
              yield* settle(
                Effect.gen(function* () {
                  yield* active(runId);
                  return yield* end(runId, statusOf(result), result);
                }),
              );
            }),
          cancelled: (runId) =>
            Stream.unwrap(
              Effect.gen(function* () {
                yield* active(runId);
                return wakes(runId).pipe(
                  Stream.mapEffect(() => runs.get(runId)),
                  Stream.takeUntil(
                    (run) =>
                      run === null ||
                      isFinished(run.status) ||
                      run.cancelRequested,
                  ),
                  Stream.filter(
                    (run) =>
                      run !== null &&
                      !isFinished(run.status) &&
                      run.cancelRequested,
                  ),
                  Stream.as('cancel' as const),
                  Stream.take(1),
                );
              }),
            ),
        });
      }),
    );
}
