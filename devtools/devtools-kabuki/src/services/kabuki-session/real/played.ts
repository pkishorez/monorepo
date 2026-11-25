import { History, Snapshot } from '@kestack/kabuki';
import type { AnyActor, HistoryEntry, Instance } from '@kestack/kabuki/types';
import type {
  Change as Marked,
  Outcome,
} from '../../../server/rpc/session/contract/index.ts';

interface Played {
  readonly outcome: Outcome;
  readonly before: Snapshot;
  readonly after: Snapshot;
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
    const { outcome, snapshot } = Snapshot.next(actor, before, entry);
    made = { outcome, before, after: snapshot };
  } catch {
    made = {
      outcome: 'dropped',
      before,
      after: { root: before.root, at: entry.at },
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

export type Change = NonNullable<Marked>;

export const changesOf = (
  before: Snapshot,
  after: Snapshot,
): ReadonlyMap<string, Change> => {
  const out = new Map<string, Change>();
  const visit = (was: Instance | undefined, is: Instance) => {
    if (was === is) return;
    if (!was) {
      for (const one of under(is)) out.set(one.address, 'started');
      return;
    }
    if (
      was.state !== is.state ||
      was.model !== is.model ||
      was.props !== is.props
    )
      out.set(is.address, 'changed');
    const held = new Map(
      childrenOf(was).map((child) => [child.address, child]),
    );
    for (const child of childrenOf(is)) visit(held.get(child.address), child);
  };
  visit(before.root, after.root);
  return out;
};
