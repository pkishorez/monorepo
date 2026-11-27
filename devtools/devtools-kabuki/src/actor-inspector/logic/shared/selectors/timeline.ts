import type { DataOf } from '@kestack/kabuki/types';
import type { Entry, InspectorShape, Step, Tick, Timeline } from '../index.ts';
import { nameOf } from './board.ts';

type Data = DataOf<typeof InspectorShape>;

const pathOf = (
  byId: ReadonlyMap<number, Entry>,
  id: number,
): ReadonlyArray<Entry> => {
  const path: Array<Entry> = [];
  let at = byId.get(id);
  while (at) {
    path.unshift(at);
    at = at.parent === null ? undefined : byId.get(at.parent);
  }
  return path;
};

const branchOf = (
  entries: ReadonlyArray<Entry>,
  branch: number | null,
  head: number | null,
): ReadonlyArray<Entry> => {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const heads = head === null ? [] : pathOf(byId, head);
  if (branch === null || heads.some(({ id }) => id === branch)) return heads;
  const parents = new Set(entries.map(({ parent }) => parent));
  const through = entries
    .filter(({ id }) => !parents.has(id))
    .map(({ id }) => pathOf(byId, id))
    .filter((path) => path.some(({ id }) => id === branch))
    .sort((a, b) => b.at(-1)!.id - a.at(-1)!.id)[0];
  return through ?? heads;
};

const branchIn = ({ model }: Data) =>
  branchOf(model.entries, model.branch, model.now?.head ?? null);

const indexOf = (branch: ReadonlyArray<Entry>, shown: Step | null) =>
  shown === null
    ? branch.length - 1
    : shown === 'start'
      ? -1
      : branch.findIndex(({ id }) => id === shown);

const tickOf = (entry: Entry, before?: Entry): Tick => {
  const said =
    entry.outcome === 'handled'
      ? entry.changed
        ? ''
        : ' · changed nothing'
      : entry.outcome === 'ignored'
        ? ' · no rule took it'
        : ' · its Instance was gone';
  return {
    id: entry.id,
    label: `${entry.tag} → ${nameOf(entry.to)}${said}`,
    tone:
      entry.outcome !== 'handled' || !entry.changed
        ? 'ignored'
        : before?.tag === entry.tag && before.to === entry.to
          ? 'again'
          : 'took',
  };
};

export const timelineOf = (data: Data): Timeline => {
  const { model } = data;
  const branch = branchIn(data);
  const index = indexOf(branch, model.shown);
  const here = index < 0 ? null : (branch[index]?.id ?? null);
  const following = model.entries.filter(({ parent }) => parent === here);
  const ends = index === branch.length - 1;
  return {
    ticks: branch.map((entry, i) => tickOf(entry, branch[i - 1])),
    at: model.shown === null ? null : index,
    next:
      following.length > 1 || (following.length > 0 && ends)
        ? following.map((entry) => ({
            ...tickOf(entry, branch[index]),
            on: branch[index + 1]?.id === entry.id,
          }))
        : [],
    running: model.now?.running ?? true,
    place: model.place,
  };
};

export const stepAt = (data: Data, at: number | null): Step | null =>
  at === null ? null : at < 0 ? 'start' : (branchIn(data)[at]?.id ?? null);

export const nextOf = (data: Data): number | null => {
  const branch = branchIn(data);
  const from = indexOf(branch, data.model.shown);
  const next = branch[from + 1];
  return next && next.id !== (data.model.now?.head ?? null) ? next.id : null;
};

export const awayFromHead = (data: Data): boolean =>
  branchIn(data).at(-1)?.id !== (data.model.now?.head ?? null);

export const onBranch = (data: Data, step: number): boolean =>
  branchIn(data).some(({ id }) => id === step);
