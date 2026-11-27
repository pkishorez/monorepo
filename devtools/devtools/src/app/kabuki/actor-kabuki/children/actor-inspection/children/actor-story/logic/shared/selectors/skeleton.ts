import type { Plan, Shape } from '@kestack/devtools-kabuki/devtools';
import {
  dataOf,
  idOf,
  itemsOf,
  payloadOf,
  refOf,
  statesOf,
} from './blueprint.js';
import type { Item, Kind } from './blueprint.js';
import type { Lit } from './picture.js';
import { rowsOf } from './shape.js';

export interface KeyLine {
  readonly id: string;
  readonly ref: string;
  readonly name: string;
  readonly depth: number;
  readonly lit: boolean;
  readonly description: string | null;
}

export interface Line {
  readonly id: string;
  readonly ref: string;
  readonly name: string;
  readonly note: string | null;
  readonly lit: boolean;
  readonly keys: ReadonlyArray<KeyLine>;
}

export interface Group {
  readonly title: string;
  readonly lines: ReadonlyArray<Line>;
}

export interface Level {
  readonly tag: string;
  readonly ref: string;
  readonly lit: boolean;
  readonly expanded: boolean;
  readonly count: string;
  readonly data: ReadonlyArray<KeyLine>;
  readonly groups: ReadonlyArray<Group>;
}

export interface Skeleton {
  readonly description: { readonly text: string; readonly lit: boolean } | null;
  readonly model: ReadonlyArray<KeyLine>;
  readonly always: {
    readonly groups: ReadonlyArray<Group>;
    readonly input: ReadonlyArray<KeyLine>;
    readonly props: ReadonlyArray<KeyLine>;
  };
  readonly states: ReadonlyArray<Level>;
}

const keysOf = (
  shape: Shape | undefined,
  base: { readonly id: string; readonly ref: string },
  refs: ReadonlySet<string>,
  whole: boolean,
): ReadonlyArray<KeyLine> =>
  shape === undefined
    ? []
    : rowsOf(shape).map((row) => {
        const id = `${base.id}.${row.id}`;
        const lit = whole || refs.has(id);
        return {
          id,
          ref: `${base.ref}.${row.id}`,
          name: row.name,
          depth: row.depth,
          lit,
          description: lit ? (row.description ?? null) : null,
        };
      });

const plural = (count: number, one: string, many: string) =>
  count === 0 ? [] : [`${count} ${count === 1 ? one : many}`];

const RUNS = { always: null, while: null, each: 'each' } as const;

const at =
  (item: Item) =>
  ({ name, state }: { readonly name: string; readonly state?: string }) =>
    name === item.name && (state ?? null) === item.level;

const noteOf = (plan: Plan, item: Item) => {
  if (item.kind === 'worker')
    return RUNS[plan.workers.find(at(item))?.runs ?? 'always'];
  if (item.kind === 'child') {
    const slot = plan.children.find(at(item));
    return slot === undefined
      ? null
      : [slot.plan.actor, RUNS[slot.runs]].filter(Boolean).join(' · ');
  }
  return null;
};

const linesOf = (
  plan: Plan,
  kind: Kind,
  level: string | null,
  refs: ReadonlySet<string>,
): ReadonlyArray<Line> =>
  itemsOf(plan, kind)
    .filter((item) => item.level === level)
    .map((item: Item) => {
      const id = idOf(item);
      const ref = refOf(plan, item);
      const lit = refs.has(id);
      const opened =
        kind === 'message' &&
        (lit || [...refs].some((one) => one.startsWith(`${id}.`)));
      return {
        id,
        ref,
        name: item.name,
        note: noteOf(plan, item),
        lit: lit || opened,
        keys: opened
          ? keysOf(payloadOf(plan, item), { id, ref }, refs, lit)
          : [],
      };
    });

const listed = (
  title: string,
  names: ReadonlyArray<{
    readonly name: string;
    readonly level?: string | undefined;
  }>,
  ref: string,
  level: string | null,
  refs: ReadonlySet<string>,
): ReadonlyArray<Group> => {
  const here = names.filter((one) => (one.level ?? null) === level);
  return here.length === 0
    ? []
    : [
        {
          title,
          lines: here.map(({ name }) => ({
            id: `${ref}:${name}`,
            ref,
            name,
            note: null,
            lit: refs.has(ref),
            keys: [],
          })),
        },
      ];
};

const kindsOf = (
  plan: Plan,
  level: string | null,
  refs: ReadonlySet<string>,
): ReadonlyArray<Group> =>
  (
    [
      ['Workers', 'worker'],
      ['Messages', 'message'],
      ['Children', 'child'],
    ] as const
  ).flatMap(([title, kind]) => {
    const lines = linesOf(plan, kind, level, refs);
    return lines.length === 0 ? [] : [{ title, lines }];
  });

const servesOf = (
  plan: Plan,
  level: string | null,
  refs: ReadonlySet<string>,
): ReadonlyArray<Group> => [
  ...listed(
    'Provides',
    plan.provides.map(({ name, state }) => ({ name, level: state })),
    'provides',
    level,
    refs,
  ),
  ...listed(
    'Queries',
    plan.queries.map(({ name, state }) => ({ name, level: state })),
    'queries',
    level,
    refs,
  ),
];

const emitsOf = (plan: Plan, refs: ReadonlySet<string>): ReadonlyArray<Group> =>
  plan.emits.length === 0
    ? []
    : [
        {
          title: 'Emits',
          lines: plan.emits.map(({ tag, payload }) => {
            const id = `emits:${tag}`;
            const on = refs.has(id);
            return {
              id,
              ref: id,
              name: tag,
              note: null,
              lit: on,
              keys: on ? keysOf(payload, { id, ref: id }, refs, true) : [],
            };
          }),
        },
      ];

const whole = (
  part: 'model' | 'input' | 'props',
  plan: Plan,
  refs: ReadonlySet<string>,
) => keysOf(plan[part], { id: part, ref: part }, refs, refs.has(part));

export const skeletonOf = (plan: Plan, lit: Lit | null): Skeleton => {
  const refs = lit?.refs ?? new Set<string>();
  const expanded = lit?.expanded ?? new Set<string>();
  return {
    description:
      plan.description === undefined
        ? null
        : { text: plan.description, lit: refs.has('description') },
    model: whole('model', plan, refs),
    always: {
      groups: [
        ...kindsOf(plan, null, refs),
        ...emitsOf(plan, refs),
        ...listed(
          'Requires',
          plan.requires.map((name) => ({ name })),
          'requires',
          null,
          refs,
        ),
        ...servesOf(plan, null, refs),
      ],
      input: whole('input', plan, refs),
      props: whole('props', plan, refs),
    },
    states: statesOf(plan).map((tag) => {
      const id = `state:${tag}`;
      const on = refs.has(id);
      const kinds = kindsOf(plan, tag, refs);
      const count = (title: string) =>
        kinds.find((group) => group.title === title)?.lines.length ?? 0;
      return {
        tag,
        ref: id,
        lit: on,
        expanded: expanded.has(tag),
        count: [
          ...plural(count('Workers'), 'worker', 'workers'),
          ...plural(count('Messages'), 'message', 'messages'),
          ...plural(count('Children'), 'child', 'children'),
        ].join(' · '),
        data: keysOf(dataOf(plan, tag), { id, ref: id }, refs, on),
        groups: [...kinds, ...servesOf(plan, tag, refs)],
      };
    }),
  };
};
