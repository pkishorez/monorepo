import type { Card, Use } from '../index.ts';

export const allOf = (card: Card): ReadonlyArray<Card> => [
  card,
  ...card.children.flatMap(allOf),
];

export const pathTo = (card: Card, id: string): ReadonlyArray<string> => {
  if (card.id === id) return [id];
  for (const child of card.children) {
    const below = pathTo(child, id);
    if (below.length > 0) return [card.id, ...below];
  }
  return [];
};

const givesTo = (card: Card, child: Card): ReadonlyArray<string> => [
  ...card.print.top.provides,
  ...(child.print.within
    ? (card.print.states[child.print.within]?.provides ?? [])
    : []),
];

export const providerOf = (
  root: Card,
  id: string,
  name: string,
): string | undefined => {
  const byId = new Map(allOf(root).map((card) => [card.id, card]));
  const path = pathTo(root, id);
  for (let i = path.length - 2; i >= 0; i--) {
    const card = byId.get(path[i]!);
    const child = byId.get(path[i + 1]!);
    if (card && child && givesTo(card, child).includes(name)) return card.id;
  }
  return undefined;
};

export const usesOf = (root: Card): ReadonlyMap<string, ReadonlyArray<Use>> =>
  new Map(
    allOf(root).map((card) => [
      card.id,
      card.print.requires.map((name): Use => ({
        name,
        from: providerOf(root, card.id, name) ?? null,
      })),
    ]),
  );

export const usersOf = (
  uses: ReadonlyMap<string, ReadonlyArray<Use>>,
  name: string,
  provider: string | null,
): ReadonlyArray<string> =>
  [...uses]
    .filter(([, used]) =>
      used.some((use) => use.name === name && use.from === provider),
    )
    .map(([id]) => id);

export const wayOf = (
  root: Card,
  provider: string | null,
  users: ReadonlyArray<string>,
): ReadonlySet<string> => {
  const way = new Set<string>(provider ? [provider] : []);
  for (const user of users) {
    const path = pathTo(root, user);
    const start = provider ? path.indexOf(provider) : 0;
    path.slice(Math.max(0, start)).forEach((id) => way.add(id));
  }
  return way;
};

export const givesOf = (card: Card): ReadonlyArray<string> => [
  ...new Set([
    ...card.print.top.provides,
    ...Object.values(card.print.states).flatMap((level) => level.provides),
  ]),
];

export const needsOf = (uses: ReadonlyArray<Use>): ReadonlyArray<string> =>
  uses.filter((use) => use.from !== null).map(({ name }) => name);

export const servicesOf = (uses: ReadonlyArray<Use>): ReadonlyArray<string> =>
  uses.filter((use) => use.from === null).map(({ name }) => name);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const readableId = (id: string) =>
  UUID.test(id)
    ? id.slice(0, 8)
    : id.length > 22
      ? `${id.slice(0, 10)}…${id.slice(-8)}`
      : id;

export const readableKey = (key: string): string => {
  try {
    const parsed: unknown = JSON.parse(key);
    if (Array.isArray(parsed))
      return parsed.map((part) => readableId(String(part))).join(' / ');
    if (typeof parsed === 'string') return readableId(parsed);
  } catch {}
  return readableId(key);
};
