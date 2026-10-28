import type { Field, Shape } from '../../../../api/index.ts';

/*
 * A Schema as a card draws it, from the Shape the Kabuki Session reads of
 * it: on one line, its fields, or as JSON to read; and how deep a value
 * opens to fit a card.
 */

/** A Shape on one line. */
export const textOf = (shape: Shape): string => {
  switch (shape.kind) {
    case 'leaf':
      return shape.text;
    case 'array':
      return `${textOf(shape.of)}[]`;
    case 'record':
      return `Record<string, ${textOf(shape.of)}>`;
    case 'union':
      return shape.members.map(textOf).join(' | ');
    case 'struct':
      return shape.fields.length === 0
        ? '{}'
        : `{ ${shape.fields.map(({ name }) => name).join(', ')} }`;
  }
};

/** The fields of a struct, or of the one struct in a union with null. */
export const fieldsOf = (shape: Shape | undefined): ReadonlyArray<Field> => {
  if (!shape) return [];
  if (shape.kind === 'struct') return shape.fields;
  if (shape.kind === 'union') {
    const structs = shape.members.filter((one) => one.kind === 'struct');
    return structs.length === 1 ? fieldsOf(structs[0]) : [];
  }
  return [];
};

/**
 * A Shape as JSON to read: each field by name, `?` when optional, its type
 * as text, a struct or list nested under it. A union with null is its
 * other side, its field marked `| null`.
 */
export const schemaJson = (shape: Shape): unknown => {
  switch (shape.kind) {
    case 'leaf':
      return shape.text;
    case 'array':
      return [schemaJson(shape.of)];
    case 'record':
      return { '[key: string]': schemaJson(shape.of) };
    case 'union': {
      const nested = shape.members.filter((one) => one.kind !== 'leaf');
      return nested.length === 1 ? schemaJson(nested[0]!) : textOf(shape);
    }
    case 'struct':
      return Object.fromEntries(
        shape.fields.map((field) => {
          const nullable =
            field.shape.kind === 'union' &&
            field.shape.members.some(
              (one) => one.kind === 'leaf' && one.text === 'null',
            ) &&
            field.shape.members.some((one) => one.kind !== 'leaf');
          return [
            `${field.name}${field.optional ? '?' : ''}${nullable ? ' | null' : ''}`,
            schemaJson(field.shape),
          ];
        }),
      );
  }
};

/** How many lines a value takes, opened `depth` levels down. */
const linesOf = (value: unknown, depth: number): number => {
  if (typeof value !== 'object' || value === null) return 1;
  const inner = Object.values(value);
  if (depth <= 0 || inner.length === 0) return 1;
  return (
    2 + inner.reduce<number>((sum, one) => sum + linesOf(one, depth - 1), 0)
  );
};

/** The deepest a value opens and still fits in about `lines` lines: at least its first level. */
export const depthFor = (value: unknown, lines = 10): number => {
  let depth = 1;
  while (
    depth < 6 &&
    linesOf(value, depth + 1) <= lines &&
    linesOf(value, depth + 1) > linesOf(value, depth)
  )
    depth++;
  return depth;
};
