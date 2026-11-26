import { Deferred, Effect, Exit, PubSub, Stream, type Take } from 'effect';
import type { OpenCodeError } from '../contract/index.js';
import type { Prompt, SessionID, Status } from '../contract/index.js';
import { Out } from './out.js';

export interface Run {
  readonly id: SessionID;
  readonly prompt: Prompt;
  readonly elements: PubSub.PubSub<Take.Take<Out, OpenCodeError>>;
  readonly done: Deferred.Deferred<void>;
}

export const make = (id: SessionID, prompt: Prompt) =>
  Effect.gen(function* () {
    const elements = yield* PubSub.unbounded<Take.Take<Out, OpenCodeError>>({
      replay: Number.MAX_SAFE_INTEGER,
    });
    const done = yield* Deferred.make<void>();
    const run: Run = { id, prompt, elements, done };
    yield* emit(run, Out.Started({ id }));
    return run;
  });

export const emit = (run: Run, out: Out) =>
  PubSub.publish(run.elements, [out]).pipe(Effect.asVoid);

const finish = (run: Run, take: Take.Take<Out, OpenCodeError>) =>
  PubSub.publish(run.elements, take).pipe(
    Effect.andThen(Deferred.succeed(run.done, undefined)),
    Effect.asVoid,
  );

export const end = (run: Run, status: Status, error?: string) =>
  emit(
    run,
    Out.Ended(error === undefined ? { status } : { status, error }),
  ).pipe(Effect.andThen(finish(run, Exit.void)));

export const refuse = (run: Run, error: OpenCodeError) =>
  finish(run, Exit.fail(error));

export const stream = (run: Run): Stream.Stream<Out, OpenCodeError> =>
  Stream.fromPubSubTake(run.elements);
