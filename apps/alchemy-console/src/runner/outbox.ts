import { Deferred, Effect, Queue, Schedule } from 'effect';
import type { RunnerEvent } from '../shared/contracts/run/index.ts';

/*
 * What the runner tells the User Space, numbered and in order: each event,
 * and each batch of log lines, has the next `seq` of its kind. One message
 * is sent at a time, and sent again until it is acknowledged, so a dropped
 * socket loses nothing; the User Space keeps each `seq` once, so a message
 * sent twice counts once. Log lines are gathered for a moment and sent as
 * one batch.
 */

export interface Send {
  readonly report: (
    seq: number,
    event: RunnerEvent,
  ) => Effect.Effect<void, unknown>;
  readonly log: (
    seq: number,
    lines: ReadonlyArray<string>,
  ) => Effect.Effect<void, unknown>;
}

type Item =
  | {
      readonly _tag: 'Event';
      readonly seq: number;
      readonly event: RunnerEvent;
    }
  | {
      readonly _tag: 'Log';
      readonly seq: number;
      readonly lines: ReadonlyArray<string>;
    }
  | { readonly _tag: 'Flush'; readonly done: Deferred.Deferred<void> };

/** The longest line kept, and the most lines in one batch. */
const LINE_LIMIT = 2000;
const BATCH_LIMIT = 200;

export const makeOutbox = (
  send: Send,
  options: {
    /** Text never sent: the run's secrets, replaced by `***`. */
    readonly redact?: ReadonlyArray<string>;
    /** Whether a failed send may succeed if tried again; when not, the outbox stops. */
    readonly retryable?: (error: unknown) => boolean;
  } = {},
) =>
  Effect.gen(function* () {
    const queue = yield* Queue.unbounded<Item>();
    let eventSeq = 0;
    let logSeq = 0;
    let lines: Array<string> = [];
    const redact = (options.redact ?? []).filter((secret) => secret.length > 0);
    // Short values (a region, `true`) would blank out ordinary words.
    const MIN_SECRET = 8;
    const retryable = options.retryable ?? (() => true);
    // Once a send is refused for good (the run is over), nothing more goes.
    let closed = false;

    const deliver = (item: Exclude<Item, { _tag: 'Flush' }>) =>
      (item._tag === 'Event'
        ? send.report(item.seq, item.event)
        : send.log(item.seq, item.lines)
      ).pipe(
        Effect.timeout('30 seconds'),
        Effect.retry({
          while: (error) => retryable(error),
          schedule: Schedule.spaced('1 second'),
        }),
      );

    const takeLines = () => {
      if (lines.length === 0) return;
      const batch = lines;
      lines = [];
      for (let start = 0; start < batch.length; start += BATCH_LIMIT)
        Queue.offerUnsafe(queue, {
          _tag: 'Log',
          seq: ++logSeq,
          lines: batch.slice(start, start + BATCH_LIMIT),
        });
    };

    yield* Effect.forkScoped(
      Effect.forever(
        Effect.gen(function* () {
          const item = yield* Queue.take(queue);
          if (item._tag === 'Flush')
            yield* Deferred.succeed(item.done, undefined);
          else if (!closed)
            yield* deliver(item).pipe(
              Effect.catch(() => Effect.sync(() => void (closed = true))),
            );
        }),
      ),
    );
    yield* Effect.forkScoped(
      Effect.forever(
        Effect.sleep('500 millis').pipe(Effect.andThen(Effect.sync(takeLines))),
      ),
    );

    return {
      /** Never sends `secret` from now on, replacing it with `***`. */
      redact: (secret: string) => {
        if (secret.length >= MIN_SECRET) redact.push(secret);
      },
      /** Sends `event` as the next step. */
      event: (event: RunnerEvent) =>
        Effect.sync(() => {
          takeLines();
          Queue.offerUnsafe(queue, { _tag: 'Event', seq: ++eventSeq, event });
        }),
      /** Sends a line of output, soon, with the lines around it. */
      line: (line: string) => {
        let kept = line;
        for (const secret of redact) kept = kept.replaceAll(secret, '***');
        lines.push(
          kept.length > LINE_LIMIT ? `${kept.slice(0, LINE_LIMIT)}…` : kept,
        );
      },
      /** Done when everything sent so far is acknowledged. */
      flush: Effect.gen(function* () {
        takeLines();
        const done = yield* Deferred.make<void>();
        yield* Queue.offer(queue, { _tag: 'Flush', done });
        yield* Deferred.await(done);
      }),
    };
  });

export type Outbox = Effect.Success<ReturnType<typeof makeOutbox>>;
