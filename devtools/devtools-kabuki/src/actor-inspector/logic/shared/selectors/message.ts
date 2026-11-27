import type { DataOf } from '@kestack/kabuki/types';
import type {
  BeforeAfter,
  Entry,
  From,
  InspectorShape,
  Kind,
  Node,
  Played,
} from '../index.ts';
import { nameOf } from './board.ts';

type Data = DataOf<typeof InspectorShape>;

export interface Link {
  readonly id: number;
  readonly to: string;
  readonly tag: string;
  readonly from: From;
  readonly shown: boolean;
}

export interface Effect {
  readonly instance: string;
  readonly path: string;
  readonly kind: Kind;
  readonly before?: unknown;
  readonly after?: unknown;
}

export interface Trace {
  readonly message: Played;
  readonly chain: ReadonlyArray<Link>;
  readonly effects: ReadonlyArray<Effect>;
  readonly actors: Readonly<Record<string, string>>;
}

const LINKS = 8;

const LOOK_BACK = 64;

const KEY = /\[([^\]]*)\]#\d+$/;

const actorsOf = (node: Node): ReadonlyArray<readonly [string, string]> => [
  [node.address, node.actor],
  ...node.children.flatMap(actorsOf),
];

export const instanceLabel = (
  address: string,
  actors: Readonly<Record<string, string>> = {},
): string => {
  const key = KEY.exec(address)?.[1];
  const name = actors[address] ?? nameOf(address);
  return key === undefined || key === '[]' ? name : `${name} [${key}]`;
};

const causeOf = (
  byId: ReadonlyMap<number, Entry>,
  link: Link,
): Entry | undefined => {
  const { from } = link;
  if (from.kind !== 'emit' && from.kind !== 'command') return undefined;
  let parent = byId.get(link.id)?.parent ?? null;
  for (let step = 0; parent !== null && step < LOOK_BACK; step++) {
    const entry = byId.get(parent);
    if (!entry) return undefined;
    if (entry.to === from.instance) return entry;
    parent = entry.parent;
  }
  return undefined;
};

const chainOf = (
  entries: ReadonlyArray<Entry>,
  message: Played,
): ReadonlyArray<Link> => {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const links: Array<Link> = [
    {
      id: message.id,
      to: message.to,
      tag: message.tag,
      from: message.from,
      shown: true,
    },
  ];
  while (links.length < LINKS) {
    const cause = causeOf(byId, links[0]!);
    if (!cause) break;
    links.unshift({
      id: cause.id,
      to: cause.to,
      tag: cause.tag,
      from: cause.from,
      shown: false,
    });
  }
  return links;
};

const kindOf = (change: BeforeAfter): Kind =>
  'before' in change ? ('after' in change ? 'changed' : 'removed') : 'added';

const fieldEffects = (
  instance: string,
  scope: string,
  changes: Readonly<Record<string, BeforeAfter>>,
): ReadonlyArray<Effect> =>
  Object.entries(changes).map(([key, change]) => ({
    instance,
    path: `${scope}.${key}`,
    kind: kindOf(change),
    ...change,
  }));

const tagOf = (state: unknown) =>
  typeof state === 'object' && state !== null && '_tag' in state
    ? String(state._tag)
    : '';

export const traceOf = ({ model }: Data): Trace | null => {
  const message = model.stepped?.message;
  if (!message) return null;
  const effects = model.stepped!.changes.flatMap(
    (change): ReadonlyArray<Effect> => {
      const instance = change.address;
      if (change._tag === 'Added')
        return [{ instance, path: '', kind: 'added' }];
      if (change._tag === 'Removed')
        return [{ instance, path: '', kind: 'removed' }];
      const state = change.state
        ? [
            change.state.transition
              ? {
                  instance,
                  path: 'state',
                  kind: 'changed' as const,
                  before: tagOf(change.state.before),
                  after: tagOf(change.state.after),
                }
              : {
                  instance,
                  path: 'state data',
                  kind: 'changed' as const,
                  before: change.state.before,
                  after: change.state.after,
                },
          ]
        : [];
      return [
        ...state,
        ...fieldEffects(instance, 'model', change.model),
        ...fieldEffects(instance, 'props', change.props),
      ];
    },
  );
  return {
    message,
    chain: chainOf(model.entries, message),
    effects,
    actors: Object.fromEntries(actorsOf(model.stepped!.tree)),
  };
};
