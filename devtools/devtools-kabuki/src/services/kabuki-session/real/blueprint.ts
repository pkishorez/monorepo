import { SchemaAST } from 'effect';
import type { Blueprint } from '@kestack/kabuki';
import type { BlueprintLevel } from '@kestack/kabuki/types';
import type {
  BlueprintNode,
  Condition,
  Level,
} from '../../../server/rpc/session/contract/index.ts';
import { payloadOf, shapeOf } from './shape.ts';

const nameOf = (key: string): string => key.split(/[/:]/).at(-1) ?? key;

const conditionOf = (
  kind: BlueprintLevel['workers'][number]['kind'],
): Condition => (kind === 'each' || kind === 'while' ? kind : 'always');

const levelOf = (print: Blueprint, level: BlueprintLevel): Level => ({
  messages: Object.entries(level.on).map(([tag, schema]) => {
    const description = SchemaAST.resolveDescription(schema.ast);
    return {
      tag,
      ...(description ? { description } : {}),
      payload: payloadOf(schema),
    };
  }),
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
    return {
      name,
      ...(schemas?.args ? { args: shapeOf(schemas.args) } : {}),
      result: schemas
        ? shapeOf(schemas.result)
        : { kind: 'json', text: 'unknown' },
    };
  }),
  provides: level.provides.map(nameOf),
});

interface Slot {
  readonly name: string;
  readonly condition: Condition;
  readonly keyed: boolean;
  readonly within: string | null;
}

export const treeOf = (
  print: Blueprint,
  place: string = print.name,
  slot: Slot | null = null,
  above: ReadonlySet<Blueprint> = new Set(),
): BlueprintNode => {
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
  const tags = Object.keys(print.state);
  return {
    place,
    slot: slot?.name ?? null,
    actor: print.name,
    ...(print.description === undefined
      ? {}
      : { description: print.description }),
    condition: slot?.condition ?? null,
    keyed: slot?.keyed ?? false,
    within: slot?.within ?? null,
    single: tags.length === 1 && tags[0] === 'Single',
    requires: [...new Set(print.requires.map(nameOf))],
    model: shapeOf(print.schemas.model),
    ...(print.schemas.props ? { props: shapeOf(print.schemas.props) } : {}),
    top: levelOf(print, print.top),
    states: Object.fromEntries(
      Object.entries(print.state).map(([tag, level]) => [
        tag,
        { ...levelOf(print, level), data: payloadOf(level.data) },
      ]),
    ),
    children: [
      ...grow(print.top, null),
      ...Object.entries(print.state).flatMap(([tag, level]) =>
        grow(level, tag),
      ),
    ],
  };
};
