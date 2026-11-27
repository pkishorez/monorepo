import { History, Snapshot } from '@kestack/kabuki';
import type {
  AnyActor,
  Change,
  HistoryEntry,
  Instance,
} from '@kestack/kabuki/types';
import type { Outcome } from '../../../server/rpc/session/contract/index.ts';

interface Played {
  readonly outcome: Outcome;
  readonly before: Snapshot;
  readonly after: Snapshot;
  readonly changes: ReadonlyArray<Change>;
  readonly commands: ReadonlyArray<Asked>;
  readonly emits: ReadonlyArray<Emit>;
}

interface Emit {
  readonly event: { readonly _tag: string };
  readonly becomes?: { readonly to: string; readonly tag: string };
}

interface Asked {
  readonly name: string;
  readonly args: unknown;
}

const played = new WeakMap<HistoryEntry, Played>();

export const playedOf = (
  actor: AnyActor,
  history: History,
  entry: HistoryEntry,
): Played => {
  const kept = played.get(entry);
  if (kept) return kept;
  const before: Snapshot = History.snapshot(actor, history, entry.parent);
  let made: Played;
  try {
    const { outcome, snapshot, commands, emits, emitted } = Snapshot.next(
      actor,
      before,
      entry,
    );
    made = {
      outcome,
      before,
      after: snapshot,
      changes: Snapshot.changes(actor, before, snapshot),
      commands: commands as ReadonlyArray<Asked>,
      emits: emits.map((event) => {
        const turned = emitted.find(({ from }) => from.name === event._tag);
        return turned
          ? {
              event,
              becomes: { to: turned.to, tag: turned.message._tag },
            }
          : { event };
      }),
    };
  } catch {
    made = {
      outcome: 'dropped',
      before,
      after: { root: before.root, at: entry.at },
      changes: [],
      commands: [],
      emits: [],
    };
  }
  played.set(entry, made);
  return made;
};

export const childrenOf = (instance: Instance): ReadonlyArray<Instance> =>
  Object.values(instance.children).flatMap((held) =>
    Snapshot.isMany(held) ? held : [held],
  );

const under = (instance: Instance): ReadonlyArray<Instance> => [
  instance,
  ...childrenOf(instance).flatMap(under),
];

export const instancesOf = (snapshot: Snapshot): ReadonlyArray<Instance> =>
  under(snapshot.root);
