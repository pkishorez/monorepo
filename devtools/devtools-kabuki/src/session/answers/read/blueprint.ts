import type { Blueprint } from '@kestack/kabuki';
import type { BlueprintLevel } from '@kestack/kabuki/types';
import type * as Api from '../../../api/index.ts';
import { schemaShape } from './schema.ts';

/*
 * The Blueprint as the Api says it: Kabuki's own (`actor.blueprint`), what
 * an Actor is and does with nothing running, read as plain data.
 *
 * 1. Levels  each level's Messages, Workers and when they run, Children
 *            and when they exist, Queries with what each is asked with and
 *            answers, and the Capabilities it Provides, declared.
 * 2. Tree    every Actor the root can grow, one node per Child slot, each
 *            by its place; an Actor that is its own Child below stops there.
 */

/** A Capability's name: the last part of its key. */
export const nameOf = (key: string): string => key.split(/[/:]/).at(-1) ?? key;

// 1. Levels
const conditionOf = (
  kind: BlueprintLevel['workers'][number]['kind'] | 'always',
): Api.GraphNode['blueprint']['top']['workers'][number]['condition'] =>
  kind === 'each' ? 'each' : kind === 'while' ? 'while' : 'always';

const levelOf = (
  print: Blueprint,
  level: BlueprintLevel,
): Api.GraphNode['blueprint']['top'] => ({
  on: Object.keys(level.on),
  workers: level.workers.map(({ name, kind }) => ({
    name,
    condition: conditionOf(kind),
  })),
  children: Object.entries(level.children).map(([name, child]) => ({
    name,
    actor: child.blueprint.name,
    condition: child.kind,
    keyed: child.keyed,
  })),
  queries: level.queries.map((name) => {
    const schemas = print.schemas.queries?.[name];
    const args = schemaShape(schemas?.args);
    return {
      name,
      ...(args ? { args } : {}),
      result: schemaShape(schemas?.result) ?? { kind: 'leaf', text: '?' },
    };
  }),
  provides: level.provides.map(nameOf),
});

const read = new WeakMap<Blueprint, Api.GraphNode['blueprint']>();

/** An Actor's Blueprint as the Api says it, read once. */
export const blueprintOf = (print: Blueprint): Api.GraphNode['blueprint'] => {
  const kept = read.get(print);
  if (kept) return kept;
  const states = Object.keys(print.state);
  const made = {
    name: print.name,
    single: states.length === 1 && states[0] === 'Single',
    requires: [...new Set(print.requires.map(nameOf))],
    top: levelOf(print, print.top),
    state: Object.fromEntries(
      Object.entries(print.state).map(([tag, level]) => [
        tag,
        levelOf(print, level),
      ]),
    ),
  };
  read.set(print, made);
  return made;
};

/** An Actor with no place in the root's Blueprint, as an Instance a Restore from older code left: nothing known of it. */
export const unknownOf = (name: string): Api.GraphNode['blueprint'] => ({
  name,
  single: true,
  requires: [],
  top: { on: [], workers: [], children: [], queries: [], provides: [] },
  state: {},
});

// 2. Tree
/** Every Actor the root can grow, whether it runs or not: no Instance, Step or change. */
export const treeOf = (
  print: Blueprint,
  place: string = print.name,
  slot: {
    readonly name: string;
    readonly condition: Api.GraphNode['condition'] & string;
    readonly keyed: boolean;
    readonly within: string | null;
  } | null = null,
  above: ReadonlySet<Blueprint> = new Set(),
): Api.GraphNode => {
  const seen = new Set(above).add(print);
  const grow = (level: BlueprintLevel, state: string | null) =>
    Object.entries(level.children).flatMap(([name, child]) =>
      seen.has(child.blueprint)
        ? []
        : [
            treeOf(
              child.blueprint,
              `${place}/${state === null ? '' : `${state}:`}${name}`,
              {
                name,
                condition: child.kind,
                keyed: child.keyed,
                within: state,
              },
              seen,
            ),
          ],
    );
  return {
    id: place,
    title: slot?.name ?? print.name,
    actor: print.name,
    blueprint: blueprintOf(print),
    condition: slot?.condition ?? null,
    keyed: slot?.keyed ?? false,
    within: slot?.within ?? null,
    state: null,
    workers: [],
    gone: [],
    children: [
      ...grow(print.top, null),
      ...Object.entries(print.state).flatMap(([tag, level]) =>
        grow(level, tag),
      ),
    ],
  };
};
