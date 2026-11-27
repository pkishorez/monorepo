import { Effect, Queue, Stream } from 'effect';
import { History } from '@kestack/kabuki';
import type { Runtime } from '@kestack/kabuki';
import type { AnyActor, HistoryEntry } from '@kestack/kabuki/types';
import type { AppRuntime } from '@kestack/kabuki/react/types';
import type {
  Cursor,
  Entry,
  HistoryAsked,
  Now,
  Told,
} from '../../../server/rpc/session/contract/index.ts';
import { playedOf } from './played.ts';

const pageOf = () => globalThis.location?.href ?? '';

const sent = new WeakMap<HistoryEntry, Entry>();

const entryOf = (
  actor: AnyActor,
  history: History,
  entry: HistoryEntry,
): Entry => {
  const kept = sent.get(entry);
  if (kept) return kept;
  const { outcome, changes } = playedOf(actor, history, entry);
  const made: Entry = {
    id: entry.id,
    parent: entry.parent,
    to: entry.to,
    tag: entry.message._tag,
    from: entry.from,
    at: entry.at,
    outcome,
    changed: changes.length > 0,
  };
  sent.set(entry, made);
  return made;
};

interface Lineage {
  readonly epoch: string;
  readonly seen: History;
  readonly newest: number | null;
}

const lineages = new WeakMap<AppRuntime, Lineage>();

const epochOf = () => Math.random().toString(36).slice(2, 10);

const newestOf = (
  entries: ReadonlyArray<HistoryEntry>,
  from: number | null,
): number | null =>
  entries.reduce<number | null>(
    (newest, { id }) => (newest === null || id > newest ? id : newest),
    from,
  );

const grows = (lineage: Lineage, entries: ReadonlyArray<HistoryEntry>) =>
  entries.every(
    ({ id, message }) =>
      lineage.newest === null ||
      id > lineage.newest ||
      History.entry(lineage.seen, id)?.message === message,
  );

const lineageOf = (app: AppRuntime): Lineage => {
  const { history } = app;
  const known = lineages.get(app);
  if (known?.seen === history) return known;
  const entries = History.all(history);
  const lineage: Lineage =
    known && grows(known, entries)
      ? { ...known, seen: history, newest: newestOf(entries, known.newest) }
      : { epoch: epochOf(), seen: history, newest: newestOf(entries, null) };
  lineages.set(app, lineage);
  return lineage;
};

const failureOf = (app: AppRuntime) => {
  const { failure } = app;
  if (!failure) return null;
  const { error } = failure;
  return `${failure.what}: ${error instanceof Error ? error.message : String(error)}`;
};

const nowOf = (app: AppRuntime, runtime: Runtime, revision: number): Now => ({
  head: app.history.head,
  previewing: app.seeking ? (app.seeking.entry ?? 'start') : null,
  running: runtime.running,
  failure: failureOf(app),
  url: pageOf(),
  revision,
});

const changes = (app: AppRuntime) =>
  Stream.callback<void>(
    (queue) =>
      Effect.acquireRelease(
        Effect.sync(() => {
          let told = pageOf();
          const tell = () => {
            told = pageOf();
            Queue.offerUnsafe(queue, undefined);
          };
          const moved = () => {
            if (pageOf() !== told) tell();
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

export const historyOf = (
  app: AppRuntime,
  { from }: HistoryAsked,
): Stream.Stream<Told> =>
  Stream.suspend(() => {
    let revision = 0;
    let cursor: Cursor | undefined = from;
    const batchOf = (): Told | undefined => {
      const { runtime, history } = app;
      if (!runtime) return undefined;
      const { epoch } = lineageOf(app);
      const after = cursor?.epoch === epoch ? cursor.after : null;
      const fresh = History.all(history).filter(
        ({ id }) => after === null || id > after,
      );
      cursor = { epoch, after: newestOf(fresh, after) };
      return {
        now: nowOf(app, runtime, revision++),
        epoch,
        entries: fresh.map((entry) => entryOf(runtime.actor, history, entry)),
        roots: History.children(history, null).map(({ id }) => id),
      };
    };
    return changes(app).pipe(
      Stream.map(batchOf),
      Stream.filter((batch): batch is Told => batch !== undefined),
    );
  });
