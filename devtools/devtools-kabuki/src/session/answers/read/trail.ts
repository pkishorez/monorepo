import { History, Snapshot } from '@kestack/kabuki';
import type { Address } from '@kestack/kabuki';
import type { AnyActor, HistoryEntry, Instance } from '@kestack/kabuki/types';
import { playedOf } from './step.ts';

/*
 * One Instance's Trail: its story along a Branch. Kabuki keeps none: it is
 * a filter over the History, each entry on the Branch asked what it did to
 * the Instance, from the Snapshots right before and right after it, as
 * playing it again gives them (./step.ts).
 */

/** One moment of an Instance's Trail, with the Instance before and after it. */
export interface Moment {
  /** The History entry; `null` for the History's start, where the Instance was there already. */
  readonly entry: HistoryEntry | null;
  /**
   * `started` by it, `changed` by it, its State, Model or Props, `received`
   * it and changed nothing, or `stopped` by it.
   */
  readonly kind: 'started' | 'changed' | 'received' | 'stopped';
  readonly before?: Instance;
  readonly after?: Instance;
}

/**
 * One Instance's Trail along the Branch to an entry, the Head by default
 * (`null`: the History's start): whether it was there at the start, each
 * entry that started it, changed its State, Model or Props, was only Sent
 * to it, or stopped it, oldest first.
 */
export const momentsOf = (
  actor: AnyActor,
  history: History,
  address: Address,
  to: number | null = history.head,
): ReadonlyArray<Moment> => {
  const moments: Array<Moment> = [];
  const there = Snapshot.at(History.snapshot(actor, history, null), address);
  if (there) moments.push({ entry: null, kind: 'started', after: there });
  for (const entry of History.entries(history, to)) {
    const { before, after } = playedOf(actor, history, entry);
    const moment = momentOf(
      entry,
      Snapshot.at(before, address),
      Snapshot.at(after, address),
    );
    if (moment) moments.push(moment);
  }
  return moments;
};

const momentOf = (
  entry: HistoryEntry,
  before: Instance | undefined,
  now: Instance | undefined,
): Moment | undefined => {
  if (!before && now) return { entry, kind: 'started', after: now };
  if (before && !now) return { entry, kind: 'stopped', before };
  if (!before || !now) return undefined;
  // The two are one step apart: what the entry left alone is the same object.
  if (
    before.state !== now.state ||
    before.model !== now.model ||
    before.props !== now.props
  )
    return { entry, kind: 'changed', before, after: now };
  return entry.to === now.address
    ? { entry, kind: 'received', before, after: now }
    : undefined;
};
