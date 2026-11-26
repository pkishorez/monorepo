import { Cause, Effect, Queue, Stream } from 'effect';

export interface Feed<A, E> {
  readonly publish: (item: A) => void;
  readonly end: () => void;
  readonly fail: (error: E) => void;
  readonly read: Stream.Stream<A, E>;
}

export const makeFeed = <A, E = never>(keep: 'all' | 'last'): Feed<A, E> => {
  let kept: Array<A> = [];
  let done: Cause.Cause<E | Cause.Done> | undefined;
  const readers = new Set<Queue.Queue<A, E | Cause.Done>>();
  const close = (cause: Cause.Cause<E | Cause.Done>) => {
    if (done !== undefined) return;
    done = cause;
    for (const reader of readers) Queue.failCauseUnsafe(reader, cause);
    readers.clear();
  };
  return {
    publish: (item) => {
      if (done !== undefined) return;
      if (keep === 'all') kept.push(item);
      else kept = [item];
      for (const reader of readers) Queue.offerUnsafe(reader, item);
    },
    end: () => close(Cause.fail(Cause.Done())),
    fail: (error) => close(Cause.fail(error)),
    read: Stream.unwrap(
      Effect.map(Queue.unbounded<A, E | Cause.Done>(), (reader) => {
        Queue.offerAllUnsafe(reader, kept);
        if (done === undefined) readers.add(reader);
        else Queue.failCauseUnsafe(reader, done);
        return Stream.fromQueue(reader).pipe(
          Stream.ensuring(Effect.sync(() => readers.delete(reader))),
        );
      }),
    ),
  };
};
