import type { Card, CardLevel, Kind, Opened, Part } from '../index.ts';
import { fieldsOf } from './shapes.ts';

export const rollup = (
  kinds: ReadonlyArray<Kind | undefined>,
): Kind | undefined => {
  const touched = kinds.filter((kind) => kind !== undefined);
  if (touched.length === 0) return undefined;
  if (kinds.every((kind) => kind === 'removed')) return 'removed';
  if (touched.every((kind) => kind === 'added')) return 'added';
  return 'changed';
};

export const levelsOf = (
  card: Card,
): {
  readonly always: CardLevel;
  readonly states: ReadonlyArray<CardLevel>;
} => {
  const { print } = card;
  const single = print.single ? print.states['Single'] : undefined;
  const always: CardLevel = {
    key: '*',
    workers: [...print.top.workers, ...(single?.workers ?? [])],
    messages: [...print.top.messages, ...(single?.messages ?? [])],
    children: [...print.top.children, ...(single?.children ?? [])],
    gives: [...print.top.provides, ...(single?.provides ?? [])],
  };
  if (single) return { always, states: [] };
  return {
    always,
    states: Object.entries(print.states).map(([tag, level]) => ({
      key: tag,
      workers: level.workers,
      messages: level.messages,
      children: level.children,
      gives: level.provides,
    })),
  };
};

export const tookChanged = (card: Card) =>
  card.took?.outcome === 'handled' && card.change !== null;

export const cardKind = (card: Card): Kind | undefined =>
  card.change === 'started'
    ? 'added'
    : card.change === 'changed'
      ? 'changed'
      : undefined;

export const childOf = (card: Card, slot: string) =>
  card.children.find((child) => child.name === slot);

export const childKind = (card: Card, slot: string): Kind | undefined => {
  const child = childOf(card, slot);
  return child ? cardKind(child) : undefined;
};

export const keysOf = (opened: Opened | null | undefined, worker: string) =>
  (opened?.workers ?? [])
    .filter((one) => one.name === worker && one.status === 'running')
    .map((one) => one.key);

export const kindsOf = (level: CardLevel, card: Card, live: boolean) => {
  if (!live) return { handles: undefined, children: undefined, all: undefined };
  const handles =
    tookChanged(card) &&
    level.messages.some((message) => card.took?.message === message.tag)
      ? ('changed' as const)
      : undefined;
  const children = rollup(
    level.children.map((child) => childKind(card, child.name)),
  );
  const all = rollup([
    ...(level.messages.length > 0 ? [handles] : []),
    ...(level.children.length > 0 ? [children] : []),
  ]);
  return { handles, children, all };
};

export const activeIn = (
  level: CardLevel,
  card: Card,
  opened: Opened | null | undefined,
  live: boolean,
) => {
  const workers = live
    ? level.workers.filter((worker) => keysOf(opened, worker.name).length > 0)
        .length
    : 0;
  const children = live
    ? level.children.filter((child) => childOf(card, child.name) !== undefined)
        .length
    : 0;
  return { workers, children, any: workers + children > 0 };
};

export const isEmpty = (level: CardLevel, card: Card) =>
  level.workers.length === 0 &&
  level.messages.length === 0 &&
  level.children.length === 0 &&
  level.gives.length === 0 &&
  (level.key === '*' ||
    fieldsOf(card.print.states[level.key]?.data).length === 0);

export const sectionOfPart = (
  levels: ReturnType<typeof levelsOf>,
  part: Part | undefined,
) => {
  if (!part) return undefined;
  const all = [levels.always, ...levels.states];
  switch (part.kind) {
    case 'state':
      return part.name;
    case 'message':
      return part.state ?? '*';
    case 'worker':
      return all.find((level) =>
        level.workers.some(({ name }) => name === part.name),
      )?.key;
    case 'child':
      return all.find((level) =>
        level.children.some(({ name }) => name === part.name),
      )?.key;
    case 'model':
    case 'props':
      return part.kind;
    case 'requires':
    case 'provides':
      return 'capabilities';
  }
};
