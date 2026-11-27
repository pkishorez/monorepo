import { SchemaAST } from 'effect';
import type { Blueprint } from '@kestack/kabuki';
import type { WantedWorker } from '@kestack/kabuki/types';
import type {
  Asked,
  Named,
  Runs,
  Tagged,
  Takes,
  Within,
} from '../../../server/rpc/session/contract/index.ts';
import { payloadOf } from './shape.ts';

export const nameOf = (key: string): string => key.split(/[/:]/).at(-1) ?? key;

export const runsOf = (
  kind: Blueprint['top']['workers'][number]['kind'],
): Runs => (kind === 'while' || kind === 'each' ? kind : 'always');

export const askedOf = (
  print: Blueprint | undefined,
  tag: string,
  wanted: ReadonlyArray<WantedWorker>,
): ReadonlyArray<Asked> => {
  const inState = new Set(
    (print?.state[tag]?.workers ?? []).map(({ name }) => name),
  );
  const kinds = new Map(
    [...(print?.top.workers ?? []), ...(print?.state[tag]?.workers ?? [])].map(
      ({ name, kind }) => [name, runsOf(kind)],
    ),
  );
  return wanted.map(({ name, key }) => {
    const runs = kinds.get(name);
    return {
      name,
      ...(key === undefined ? {} : { key }),
      within: inState.has(name) ? 'state' : 'always',
      ...(runs === undefined ? {} : { runs }),
    };
  });
};

export const providesOf = (
  print: Blueprint | undefined,
  tag: string,
): ReadonlyArray<Named> =>
  print
    ? [
        ...print.top.provides.map((key) => ({
          name: nameOf(key),
          within: 'always' as const,
        })),
        ...(print.state[tag]?.provides ?? []).map((key) => ({
          name: nameOf(key),
          within: 'state' as const,
        })),
      ]
    : [];

export const taggedOf = (
  tag: string,
  schema: Parameters<typeof payloadOf>[0],
): Tagged => {
  const description = SchemaAST.resolveDescription(schema.ast);
  return {
    tag,
    ...(description ? { description } : {}),
    payload: payloadOf(schema),
  };
};

const takenAt = (
  on: Readonly<Record<string, Parameters<typeof payloadOf>[0]>>,
  within: Within,
): ReadonlyArray<Takes> =>
  Object.entries(on).map(([tag, schema]) => ({
    ...taggedOf(tag, schema),
    within,
  }));

export const takesOf = (
  print: Blueprint | undefined,
  tag: string,
): ReadonlyArray<Takes> => {
  if (!print) return [];
  const here = print.state[tag]?.on ?? {};
  const always = Object.fromEntries(
    Object.entries(print.top.on).filter(([name]) => !(name in here)),
  );
  return [...takenAt(here, 'state'), ...takenAt(always, 'always')];
};
