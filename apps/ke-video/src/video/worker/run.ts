import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  Cause,
  Deferred,
  Effect,
  Exit,
  type Layer,
  Schema,
  Scope,
  Semaphore,
} from 'effect';
import { single } from '@kestack/cli-platform/single';
import {
  appendEvent,
  Busy,
  busySocket,
  type Event,
  type Files,
  modelFolder,
  readVideo,
  type Result,
  STEPS,
  Step,
  type Strength,
  type Video,
  WorkerControl,
  workerSocket,
  writeVideo,
} from '../library/index.ts';

/*
 * One worker's run for one Video: it holds the Video's worker socket, waits
 * for the busy one, then runs each step not done yet, keeping the record
 * and the log as it goes, until every step is done, one fails, or it is
 * stopped.
 */

/** What the pipeline is given to run one step of one Video. */
export interface Job {
  readonly id: string;
  readonly url: string;
  readonly strength: Strength;
  readonly files: Files;
  /** The folder of cut-rules.md, summary-rules.md and learnings.md. */
  readonly skill: string;
  /** The speech model's folder. */
  readonly model: string;
  /** Logs an Event and folds it into the record; progress-only Events are kept at most once per whole percent. */
  readonly emit: (event: Omit<Event, 'at'>) => Effect.Effect<void>;
  /** Sets what a step learns of the Video. */
  readonly update: (patch: {
    readonly title?: string | null;
    readonly channel?: string | null;
    readonly duration?: number | null;
    readonly result?: Result;
  }) => Effect.Effect<void>;
}

/** A thing the pipeline needs on this computer. */
export interface Requirement {
  readonly name: string;
  readonly ok: boolean;
  readonly install: string;
}

/** What `src/video/pipeline` exports, which the worker runs. */
export interface Pipeline<R> {
  readonly run: (
    step: Step,
    job: Job,
  ) => Effect.Effect<
    void,
    { readonly _tag: 'StepFailed'; readonly message: string },
    R
  >;
  readonly services: Layer.Layer<R>;
  readonly requirements: Effect.Effect<ReadonlyArray<Requirement>>;
}

/**
 * The module `KE_VIDEO_PIPELINE` names, which tests set to a fake pipeline;
 * undefined when unset, for the real one.
 */
export const fakePipeline = async () => {
  const path = process.env['KE_VIDEO_PIPELINE'];
  return path === undefined || path === ''
    ? undefined
    : ((await import(pathToFileURL(path).href)) as Pipeline<never>);
};

/** How a run ended. */
export type Outcome = 'done' | 'stopped' | 'failed' | 'already';

const SKILL = fileURLToPath(new URL('../../../skill', import.meta.url));

const isStep = Schema.is(Step);

const percent = (progress: number) => Math.floor(progress * 100);

/** `seconds` as H:MM:SS, or M:SS under an hour. */
const clock = (seconds: number) => {
  const whole = Math.round(seconds);
  const [h, m, s] = [
    Math.floor(whole / 3600),
    Math.floor((whole % 3600) / 60),
    whole % 60,
  ];
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
};

/** The text of the `done` Event: old → new length. */
const doneText = (video: Video) =>
  video.result !== null && video.duration !== null && video.duration > 0
    ? `${clock(video.duration)} → ${clock(video.result.duration)} (${Math.round(
        (1 - video.result.duration / video.duration) * 100,
      )}% shorter)`
    : 'done';

/** The text of the `stop` Event. */
const stopText = (video: Video) =>
  video.state === 'queued' || video.step === null
    ? 'stopped while queued'
    : `stopped during ${video.step}${
        video.progress === null ? '' : ` (${percent(video.progress)}%)`
      }`;

/** The record, kept in memory and written whole after every change, one change at a time. */
const keep = (first: Video) =>
  Effect.gen(function* () {
    let current = first;
    const lock = yield* Semaphore.make(1);
    const shown = new Map<string, number>();
    const change = (next: (video: Video) => Video) =>
      Effect.suspend(() => {
        const video = { ...next(current), updatedAt: new Date().toISOString() };
        return Effect.map(writeVideo(video), () => {
          current = video;
        });
      }).pipe(Effect.orDie);
    const log = (event: Omit<Event, 'at'>) =>
      appendEvent(current.id, { at: new Date().toISOString(), ...event }).pipe(
        Effect.orDie,
      );
    return {
      get: () => current,
      change: (next: (video: Video) => Video) => lock.withPermit(change(next)),
      /** Logs `event`, then changes the record by `next`. */
      finish: (event: Omit<Event, 'at'>, next: (video: Video) => Video) =>
        lock.withPermit(
          Effect.andThen(
            log(event),
            change((video) => ({
              ...next(video),
              latest: event.text ?? video.latest,
            })),
          ),
        ),
      emit: (event: Omit<Event, 'at'>) =>
        lock.withPermit(
          Effect.suspend(() => {
            if (event.progress !== undefined) {
              const key = `${event.step}/${event.label ?? ''}`;
              if (
                event.text === undefined &&
                shown.get(key) === percent(event.progress)
              )
                return Effect.void;
              shown.set(key, percent(event.progress));
            }
            return Effect.andThen(
              log(event),
              change((video) => ({
                ...video,
                step: isStep(event.step) ? event.step : video.step,
                progress: event.progress ?? video.progress,
                latest: event.text ?? video.latest,
              })),
            );
          }),
        ),
    };
  });

type Keeper = Effect.Success<ReturnType<typeof keep>>;

/** Holds the busy socket for the Scope, waiting while another worker holds it, and saying once which Video that is. */
const claimBusy = (record: Keeper) =>
  Effect.gen(function* () {
    const id = record.get().id;
    let told = false;
    for (;;) {
      const attempt = yield* Scope.make();
      const claim = yield* single(busySocket(), {
        group: Busy,
        handlers: Busy.toLayer({ who: () => Effect.succeed(id) }),
      }).pipe(Scope.provide(attempt));
      if (claim._tag === 'Acquired') {
        yield* Effect.addFinalizer(() => Scope.close(attempt, Exit.void));
        return;
      }
      if (!told) {
        const other = yield* claim.client.who().pipe(
          Effect.timeout('2 seconds'),
          Effect.orElseSucceed(() => null),
        );
        yield* record.emit({
          step: 'check',
          label: 'queue',
          text:
            other === null
              ? 'waiting for another video to finish'
              : `waiting for ${other} to finish`,
        });
        told = true;
      }
      yield* Scope.close(attempt, Exit.void);
      yield* Effect.sleep('2 seconds');
    }
  });

/**
 * Runs the Video `id` on `pipeline` until every step is done, one fails, or
 * `stop` is asked on its socket or the run is interrupted (SIGTERM); the
 * record and the log say which. `already` when another worker holds it.
 */
export const work = <R>(id: string, pipeline: Pipeline<R>) =>
  Effect.scoped(
    Effect.gen(function* () {
      const stopping = yield* Deferred.make<void>();
      const claim = yield* single(workerSocket(id), {
        group: WorkerControl,
        handlers: WorkerControl.toLayer({
          stop: () => Effect.asVoid(Deferred.succeed(stopping, undefined)),
        }),
      });
      if (claim._tag === 'AlreadyRunning') return 'already' as Outcome;
      const record = yield* keep(yield* readVideo(id));
      yield* record.change((video) => ({
        ...video,
        state: 'queued',
        progress: null,
        error: null,
      }));
      const first = record.get();
      const job: Job = {
        id,
        url: first.url,
        strength: first.strength,
        files: first.files,
        skill: SKILL,
        model: modelFolder(),
        emit: record.emit,
        update: (patch) => record.change((video) => ({ ...video, ...patch })),
      };
      const steps = Effect.gen(function* () {
        yield* claimBusy(record);
        for (const step of STEPS) {
          if (record.get().done.includes(step)) continue;
          yield* record.change((video) => ({
            ...video,
            state: 'running',
            step,
            progress: null,
          }));
          yield* pipeline.run(step, job);
          yield* record.change((video) => ({
            ...video,
            done: [...video.done, step],
            progress: null,
          }));
        }
      }).pipe(Effect.scoped, Effect.provide(pipeline.services));
      const stopped = Effect.suspend(() =>
        record.finish(
          { step: 'stop', text: stopText(record.get()) },
          (video) => ({
            ...video,
            state: 'stopped',
          }),
        ),
      );
      const ended = yield* Effect.raceFirst(
        Effect.as(steps, 'done' as const),
        Effect.as(Deferred.await(stopping), 'stopped' as const),
      ).pipe(
        Effect.onInterrupt(() => stopped),
        Effect.exit,
      );
      if (Exit.isSuccess(ended) && ended.value === 'done') {
        yield* record.finish(
          { step: 'done', text: doneText(record.get()) },
          (video) => ({
            ...video,
            state: 'done',
            step: null,
            progress: null,
          }),
        );
        return 'done' as Outcome;
      }
      if (Exit.isSuccess(ended)) {
        yield* stopped;
        return 'stopped' as Outcome;
      }
      if (Cause.hasInterruptsOnly(ended.cause)) return 'stopped' as Outcome;
      const error = Cause.squash(ended.cause);
      const message = error instanceof Error ? error.message : String(error);
      yield* record.finish({ step: 'fail', text: message }, (video) => ({
        ...video,
        state: 'failed',
        error: {
          step:
            video.step ??
            STEPS.find((step) => !video.done.includes(step)) ??
            'info',
          message,
        },
      }));
      return 'failed' as Outcome;
    }),
  );
