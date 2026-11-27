import type { DataOf } from '@kestack/kabuki/types';
import { allOf } from '../../../../logic/shared/index.ts';
import type { BlueprintNode, Card } from '../../../../logic/shared/index.ts';
import type {
  Entry,
  Looked,
  RunningShape,
  Step,
  Tick,
  Timeline,
} from './shape.ts';

type Data = DataOf<typeof RunningShape>;

export const shownOf = ({ model }: Data): Step | null =>
  model.now?.seeking ?? null;

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

export const branchOf = (
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

const short = (address: string) => address.split('/').at(-1) ?? address;

const tickOf = (entry: Entry): Tick => {
  const said =
    entry.outcome === 'handled'
      ? ''
      : entry.outcome === 'ignored'
        ? ' · no rule took it'
        : ' · its Instance was gone';
  return {
    id: entry.id,
    label: `${entry.tag.split('/').at(-1)} → ${short(entry.to)}${said}`,
    tone: entry.outcome === 'handled' ? 'took' : 'ignored',
  };
};

export const timelineOf = (data: Data): Timeline => {
  const { model } = data;
  const branch = branchIn(data);
  const shown = shownOf(data);
  const index = indexOf(branch, shown);
  const here = index < 0 ? null : (branch[index]?.id ?? null);
  const following = model.entries.filter(({ parent }) => parent === here);
  const ends = index === branch.length - 1;
  return {
    ticks: branch.map(tickOf),
    at: shown === null ? null : index,
    next:
      following.length > 1 || (following.length > 0 && ends)
        ? following.map((entry) => ({
            ...tickOf(entry),
            on: branch[index + 1]?.id === entry.id,
          }))
        : [],
    running: model.now?.running ?? true,
    place: model.place,
  };
};

export const stepAt = (data: Data, at: number | null): Step | null =>
  at === null ? null : at < 0 ? 'start' : (branchIn(data)[at]?.id ?? null);

export const firstOf = (data: Data): number | undefined =>
  branchIn(data)[0]?.id;

export const nextOf = (data: Data): number | null => {
  const branch = branchIn(data);
  const from = indexOf(branch, shownOf(data));
  const next = branch[from + 1];
  return next && from + 1 < branch.length - 1 ? next.id : null;
};

export const onBranch = (data: Data, step: number): boolean =>
  branchIn(data).some(({ id }) => id === step);

export const problemOf = (error: { readonly _tag: string }) =>
  error._tag === 'StepNotFound'
    ? 'This Step is no longer kept.'
    : 'The Kabuki Session did not answer.';

export const followedOf = (data: Data): string | undefined => {
  const { model } = data;
  const shown = shownOf(data);
  if (model.presenting || typeof shown !== 'number' || model.closed === shown)
    return undefined;
  return model.entries.find(({ id }) => id === shown)?.to;
};

const printsOf = (print: BlueprintNode): ReadonlyArray<BlueprintNode> => [
  print,
  ...print.children.flatMap(printsOf),
];

export const lookedCard = (
  root: BlueprintNode,
  looked: Looked,
  step: Entry | undefined,
): Card | undefined => {
  const prints = printsOf(root);
  const byPlace = new Map(prints.map((print) => [print.place, print]));
  const byActor = new Map<string, BlueprintNode>();
  for (const print of prints)
    if (!byActor.has(print.actor)) byActor.set(print.actor, print);
  const cardsOf = (one: Looked): ReadonlyArray<Card> => {
    const print = byPlace.get(one.place) ?? byActor.get(one.actor);
    if (!print) return [];
    return [
      {
        id: one.address,
        name: one.slot ?? one.actor,
        ...(one.key === undefined ? {} : { key: one.key }),
        print,
        state: one.state,
        change: one.change,
        ...(step?.to === one.address
          ? { took: { message: step.tag, outcome: step.outcome } }
          : {}),
        children: one.children.flatMap(cardsOf),
      },
    ];
  };
  return cardsOf(looked)[0];
};

export const cardsOf = ({ model }: Data): Card | null => {
  if (!model.print || !model.look) return null;
  const { at } = model.look;
  const step =
    typeof at === 'number'
      ? model.entries.find(({ id }) => id === at)
      : undefined;
  return lookedCard(model.print, model.look.root, step) ?? null;
};

const cardAt = (data: Data, id: string): Card | undefined => {
  const root = cardsOf(data);
  return root ? allOf(root).find((card) => card.id === id) : undefined;
};

export const openedOf = (data: Data): ReadonlyArray<string> => {
  const { model } = data;
  if (model.presenting) return [];
  const followed = followedOf(data);
  const root = cardsOf(data);
  const there = new Set(root ? allOf(root).map(({ id }) => id) : []);
  return [
    ...model.opened.filter((one) => one !== followed),
    ...(followed ? [followed] : []),
  ].filter((id) => there.has(id));
};

export const bringOf = (
  data: Data,
): { readonly id?: string; readonly key: string } | null => {
  const followed = followedOf(data);
  const shown = shownOf(data);
  if (shown === null) return { key: 'now' };
  return followed && typeof shown === 'number'
    ? { id: followed, key: `step:${shown}` }
    : null;
};

export const instanceOf = (data: Data, address: string) => {
  const card = cardAt(data, address)!;
  return {
    at: shownOf(data),
    revision: data.model.now?.revision ?? 0,
    print: card.print,
    state: card.state ?? '',
  };
};
