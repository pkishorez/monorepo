import type { Plan, Shape } from '@kestack/devtools-kabuki/devtools';
import {
  dataOf,
  idOf,
  itemsOf,
  payloadOf,
  refOf,
  statesOf,
} from './blueprint.js';
import type { Item } from './blueprint.js';
import { KINDS, SECTION_OF } from '../index.js';
import type { Kind, Section } from '../index.js';
import { parentsOf, sectionId } from './folds.js';
import type { Lit } from './picture.js';
import { rowsOf } from './shape.js';

interface Fold {
  readonly id: string;
  readonly open: boolean;
  readonly count: number;
}

export interface KeyLine {
  readonly id: string;
  readonly ref: string;
  readonly name: string;
  readonly depth: number;
  readonly lit: boolean;
  readonly description: string | null;
  readonly fold: Fold | null;
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
  readonly id: string;
  readonly title: string;
  readonly open: boolean;
  readonly lit: boolean;
  readonly count: number;
  readonly lines: ReadonlyArray<Line>;
  readonly keys: ReadonlyArray<KeyLine>;
}

export interface Level {
  readonly tag: string;
  readonly ref: string;
  readonly lit: boolean;
  readonly open: boolean;
  readonly count: string;
  readonly data: ReadonlyArray<KeyLine>;
  readonly groups: ReadonlyArray<Group>;
}

export interface Skeleton {
  readonly description: { readonly text: string; readonly lit: boolean } | null;
  readonly model: ReadonlyArray<KeyLine>;
  readonly always: { readonly groups: ReadonlyArray<Group> };
  readonly states: ReadonlyArray<Level>;
}

interface Seen {
  readonly refs: ReadonlySet<string>;
  readonly open: ReadonlySet<string>;
}

const keysOf = (
  shape: Shape | undefined,
  base: { readonly id: string; readonly ref: string },
  seen: Seen,
  whole: boolean,
  folding: boolean,
): ReadonlyArray<KeyLine> => {
  if (shape === undefined) return [];
  const rows = rowsOf(shape);
  const parents = new Set(folding ? parentsOf(shape) : []);
  const shown = (id: string) => {
    const parts = id.split('.');
    return parts
      .slice(0, -1)
      .every((_, at) =>
        seen.open.has(`${base.id}.${parts.slice(0, at + 1).join('.')}`),
      );
  };
  return rows
    .filter((row) => !folding || shown(row.id))
    .map((row) => {
      const id = `${base.id}.${row.id}`;
      const lit = whole || seen.refs.has(id);
      return {
        id,
        ref: `${base.ref}.${row.id}`,
        name: row.name,
        depth: row.depth,
        lit,
        description: lit ? (row.description ?? null) : null,
        fold: parents.has(row.id)
          ? {
              id,
              open: seen.open.has(id),
              count: rows.filter(
                (child) =>
                  child.depth === row.depth + 1 &&
                  child.id.startsWith(`${row.id}.`),
              ).length,
            }
          : null,
      };
    });
};

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

const TITLE_OF: Readonly<Record<Section, string>> = {
  workers: 'Workers',
  messages: 'Messages',
  children: 'Children',
  emits: 'Emits',
  requires: 'Requires',
  provides: 'Provides',
  queries: 'Queries',
  input: 'Input',
  props: 'Props',
};

const group = (
  level: string | null,
  section: Section,
  seen: Seen,
  parts: {
    readonly lines?: ReadonlyArray<Line>;
    readonly keys?: ReadonlyArray<KeyLine>;
    readonly count?: number;
    readonly lit?: boolean;
  },
): ReadonlyArray<Group> => {
  const lines = parts.lines ?? [];
  const keys = parts.keys ?? [];
  const count = parts.count ?? lines.length;
  if (count === 0) return [];
  const id = sectionId(level, section);
  return [
    {
      id,
      title: TITLE_OF[section],
      open: seen.open.has(id),
      lit:
        (parts.lit ?? false) ||
        lines.some((line) => line.lit) ||
        keys.some((key) => key.lit),
      count,
      lines,
      keys,
    },
  ];
};

const linesOf = (
  plan: Plan,
  kind: Kind,
  level: string | null,
  seen: Seen,
): ReadonlyArray<Line> =>
  itemsOf(plan, kind)
    .filter((item) => item.level === level)
    .map((item: Item) => {
      const id = idOf(item);
      const ref = refOf(plan, item);
      const lit = seen.refs.has(id);
      const opened =
        kind === 'message' &&
        (lit || [...seen.refs].some((one) => one.startsWith(`${id}.`)));
      return {
        id,
        ref,
        name: item.name,
        note: noteOf(plan, item),
        lit: lit || opened,
        keys: opened
          ? keysOf(payloadOf(plan, item), { id, ref }, seen, lit, false)
          : [],
      };
    });

const listedLines = (
  names: ReadonlyArray<string>,
  ref: string,
  seen: Seen,
): ReadonlyArray<Line> =>
  names.map((name) => ({
    id: `${ref}:${name}`,
    ref,
    name,
    note: null,
    lit: seen.refs.has(ref),
    keys: [],
  }));

const kindsOf = (plan: Plan, level: string | null, seen: Seen) =>
  KINDS.flatMap((kind) =>
    group(level, SECTION_OF[kind], seen, {
      lines: linesOf(plan, kind, level, seen),
    }),
  );

const servesOf = (plan: Plan, level: string | null, seen: Seen) =>
  (['provides', 'queries'] as const).flatMap((list) =>
    group(level, list, seen, {
      lines: listedLines(
        plan[list]
          .filter(({ state }) => (state ?? null) === level)
          .map(({ name }) => name),
        list,
        seen,
      ),
      lit: seen.refs.has(list),
    }),
  );

const emitsOf = (plan: Plan, seen: Seen) =>
  group(null, 'emits', seen, {
    lines: plan.emits.map(({ tag, payload }) => {
      const id = `emits:${tag}`;
      const on = seen.refs.has(id);
      return {
        id,
        ref: id,
        name: tag,
        note: null,
        lit: on,
        keys: on ? keysOf(payload, { id, ref: id }, seen, true, false) : [],
      };
    }),
  });

const shapedOf = (part: 'input' | 'props', plan: Plan, seen: Seen) => {
  const shape = plan[part];
  return group(null, part, seen, {
    keys: keysOf(
      shape,
      { id: part, ref: part },
      seen,
      seen.refs.has(part),
      true,
    ),
    count:
      shape === undefined
        ? 0
        : rowsOf(shape).filter((row) => row.depth === 0).length,
    lit: seen.refs.has(part),
  });
};

export const skeletonOf = (plan: Plan, lit: Lit | null): Skeleton => {
  const seen: Seen = {
    refs: lit?.refs ?? new Set<string>(),
    open: lit?.open ?? new Set<string>(),
  };
  return {
    description:
      plan.description === undefined
        ? null
        : { text: plan.description, lit: seen.refs.has('description') },
    model: keysOf(
      plan.model,
      { id: 'model', ref: 'model' },
      seen,
      seen.refs.has('model'),
      true,
    ),
    always: {
      groups: [
        ...kindsOf(plan, null, seen),
        ...emitsOf(plan, seen),
        ...group(null, 'requires', seen, {
          lines: listedLines(plan.requires, 'requires', seen),
          lit: seen.refs.has('requires'),
        }),
        ...servesOf(plan, null, seen),
        ...shapedOf('input', plan, seen),
        ...shapedOf('props', plan, seen),
      ],
    },
    states: statesOf(plan).map((tag) => {
      const id = `state:${tag}`;
      const kinds = kindsOf(plan, tag, seen);
      const count = (title: string) =>
        kinds.find((one) => one.title === title)?.count ?? 0;
      return {
        tag,
        ref: id,
        lit: seen.refs.has(id),
        open: seen.open.has(id),
        count: [
          ...plural(count('Workers'), 'worker', 'workers'),
          ...plural(count('Messages'), 'message', 'messages'),
          ...plural(count('Children'), 'child', 'children'),
        ].join(' · '),
        data: keysOf(
          dataOf(plan, tag),
          { id, ref: id },
          seen,
          seen.refs.has(id),
          true,
        ),
        groups: [...kinds, ...servesOf(plan, tag, seen)],
      };
    }),
  };
};
