import type { Schema } from 'effect';
import type { Blueprint } from '@kestack/kabuki';
import type { BlueprintLevel } from '@kestack/kabuki/types';
import type { Plan } from '../../../server/rpc/session/contract/index.ts';
import { nameOf, runsOf, taggedOf } from './levels.ts';
import { payloadOf, shapeOf } from './shape.ts';

const writtenIn = (state: string | undefined) =>
  state === undefined ? {} : { state };

const childPath = (parent: string, state: string | undefined, slot: string) =>
  `${parent}/${state === undefined ? '' : `${state}:`}${slot}`;

const tagIn = (schema: Schema.Top): string | undefined => {
  const shape = shapeOf(schema);
  const tag =
    shape.kind === 'struct'
      ? shape.fields.find(({ name }) => name === '_tag')?.shape
      : undefined;
  return tag?.kind === 'choice' && tag.options.length === 1
    ? String(tag.options[0])
    : undefined;
};

const casesOf = (
  schema: Schema.Top | undefined,
): ReadonlyArray<readonly [string, Schema.Top]> => {
  if (!schema) return [];
  const { cases, members } = schema as {
    readonly cases?: Readonly<Record<string, Schema.Top>>;
    readonly members?: ReadonlyArray<Schema.Top>;
  };
  if (cases) return Object.entries(cases);
  return (members ?? [schema]).flatMap((one) => {
    const tag = tagIn(one);
    return tag === undefined ? [] : [[tag, one] as const];
  });
};

const treeOf = (
  print: Blueprint,
  path: string,
  above: ReadonlyMap<Blueprint, string>,
): Plan => {
  const repeats = above.get(print);
  const below = new Map(above).set(print, path);
  const levels: ReadonlyArray<readonly [string | undefined, BlueprintLevel]> = [
    [undefined, print.top],
    ...Object.entries(print.state),
  ];
  const each = <A>(
    read: (
      level: BlueprintLevel,
      state: string | undefined,
    ) => ReadonlyArray<A>,
  ) => levels.flatMap(([state, level]) => read(level, state));
  const { input, model, props, emits, queries } = print.schemas;
  return {
    path,
    actor: print.name,
    ...(print.description === undefined
      ? {}
      : { description: print.description }),
    ...(repeats === undefined ? {} : { repeats }),
    ...(input ? { input: shapeOf(input) } : {}),
    model: shapeOf(model),
    ...(props ? { props: shapeOf(props) } : {}),
    states: Object.entries(print.state).map(([tag, { data }]) => ({
      tag,
      data: payloadOf(data),
    })),
    messages: each((level, state) =>
      Object.entries(level.on).map(([tag, schema]) => ({
        ...taggedOf(tag, schema),
        ...writtenIn(state),
      })),
    ),
    workers: each((level, state) =>
      level.workers.map(({ name, kind }) => ({
        name,
        runs: runsOf(kind),
        ...writtenIn(state),
      })),
    ),
    emits: casesOf(emits).map(([tag, schema]) => taggedOf(tag, schema)),
    requires: [...new Set(print.requires.map(nameOf))],
    provides: each((level, state) =>
      level.provides.map((key) => ({ name: nameOf(key), ...writtenIn(state) })),
    ),
    queries: each((level, state) =>
      level.queries.map((name) => {
        const asked = queries?.[name];
        return {
          name,
          ...writtenIn(state),
          ...(asked?.args ? { args: shapeOf(asked.args) } : {}),
          result: asked
            ? shapeOf(asked.result)
            : { kind: 'json' as const, text: 'unknown' },
        };
      }),
    ),
    children:
      repeats === undefined
        ? each((level, state) =>
            Object.entries(level.children).map(([name, child]) => ({
              name,
              ...writtenIn(state),
              runs: child.kind,
              keyed: child.keyed,
              plan: treeOf(
                child.blueprint,
                childPath(path, state, name),
                below,
              ),
            })),
          )
        : [],
  };
};

const planned = new WeakMap<Blueprint, Plan>();

export const planOf = (root: Blueprint): Plan => {
  const kept = planned.get(root);
  if (kept) return kept;
  const plan = treeOf(root, root.name, new Map());
  planned.set(root, plan);
  return plan;
};
