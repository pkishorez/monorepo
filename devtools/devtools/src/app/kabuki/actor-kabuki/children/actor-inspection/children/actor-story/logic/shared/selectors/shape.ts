import type { Shape } from '@kestack/devtools-kabuki/devtools';

interface Key {
  readonly id: string;
  readonly name: string;
  readonly depth: number;
  readonly description?: string;
}

const inner = (shape: Shape): Shape | null =>
  shape.kind === 'struct' && shape.fields.length > 0
    ? shape
    : shape.kind === 'array'
      ? inner(shape.of)
      : null;

export const rowsOf = (
  shape: Shape,
  depth = 0,
  under = '',
): ReadonlyArray<Key> => {
  if (shape.kind !== 'struct') return [];
  return shape.fields.flatMap((field) => {
    const id = `${under}${field.name}`;
    const nested = inner(field.shape);
    return [
      {
        id,
        name: field.name,
        depth,
        ...(field.description === undefined
          ? {}
          : { description: field.description }),
      },
      ...(nested === null ? [] : rowsOf(nested, depth + 1, `${id}.`)),
    ];
  });
};

export const namesOf = (shape: Shape): ReadonlyArray<string> =>
  rowsOf(shape).map(({ name }) => name);
