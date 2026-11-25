import { Cause, Effect, Queue, Stream } from 'effect';
import { History } from '@kestack/kabuki';
import type { Runtime } from '@kestack/kabuki';
import type { AnyActor, HistoryEntry } from '@kestack/kabuki/types';
import type { AppRuntime } from '@kestack/kabuki/react/types';
import type {
  Entry,
  Watched,
} from '../../../server/rpc/session/contract/index.ts';
import { playedOf } from './played.ts';

const pageOf = () => globalThis.location?.href ?? '';

const entryOf = (
  actor: AnyActor,
  history: History,
  entry: HistoryEntry,
): Entry => ({
  id: entry.id,
  parent: entry.parent,
  to: entry.to,
  tag: entry.message._tag,
  from: entry.from,
  at: entry.at,
  outcome: playedOf(actor, history, entry).outcome,
});

const failureOf = (app: AppRuntime) => {
  const { failure } = app;
  if (!failure) return null;
  const { error } = failure;
  return `${failure.what}: ${error instanceof Error ? error.message : String(error)}`;
};

const watchedOf = (
  app: AppRuntime,
  runtime: Runtime,
  revision: number,
): Watched => {
  const { history } = app;
  return {
    now: {
      head: history.head,
      seeking: app.seeking ? (app.seeking.entry ?? 'start') : null,
      running: runtime.running,
      failure: failureOf(app),
      url: pageOf(),
      revision,
    },
    entries: History.all(history).map((entry) =>
      entryOf(runtime.actor, history, entry),
    ),
  };
};

export const watchOf = (app: AppRuntime): Stream.Stream<Watched> =>
  Stream.callback<Watched>(
    (queue) =>
      Effect.acquireRelease(
        Effect.sync(() => {
          let revision = 0;
          let told: string | undefined;
          const tell = () => {
            const { runtime } = app;
            if (!runtime) return;
            try {
              const watched = watchedOf(app, runtime, revision++);
              told = watched.now.url;
              Queue.offerUnsafe(queue, watched);
            } catch (error) {
              Queue.failCauseUnsafe(queue, Cause.die(error));
            }
          };
          const moved = () => {
            if (told !== undefined && pageOf() !== told) tell();
          };
          const changed = () => {
            tell();
            setTimeout(moved, 0);
          };
          tell();
          globalThis.addEventListener?.('popstate', moved);
          const unsubscribe = app.subscribe(changed);
          return () => {
            unsubscribe();
            globalThis.removeEventListener?.('popstate', moved);
          };
        }),
        (stop) => Effect.sync(stop),
      ),
    { bufferSize: 1, strategy: 'sliding' },
  );
