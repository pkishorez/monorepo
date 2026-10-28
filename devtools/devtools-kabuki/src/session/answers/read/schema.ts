import { SchemaAST } from 'effect';
import type { Schema } from 'effect';

/*
 * A Schema as the card draws it: fields and their types, as far down as a
 * card has room for. Read from the Schemas an Actor's definition keeps:
 * its Model and Props as trees, its States and Messages by tag, each with
 * the fields it carries.
 */

export type Shape =
  | { readonly kind: 'struct'; readonly fields: ReadonlyArray<Field> }
  | { readonly kind: 'array'; readonly of: Shape }
  | { readonly kind: 'record'; readonly of: Shape }
  | { readonly kind: 'union'; readonly members: ReadonlyArray<Shape> }
  | { readonly kind: 'leaf'; readonly text: string };

export interface Field {
  readonly name: string;
  readonly optional: boolean;
  readonly shape: Shape;
}

const leaf = (text: string): Shape => ({ kind: 'leaf', text });

const named = (ast: SchemaAST.AST) => {
  const annotations = (
    ast as { readonly annotations?: Record<string, unknown> }
  ).annotations;
  const name = annotations?.['identifier'] ?? annotations?.['title'];
  return typeof name === 'string' ? name : undefined;
};

export const shapeOf = (ast: SchemaAST.AST, depth = 0): Shape => {
  if (depth > 6) return leaf('…');
  switch (ast._tag) {
    case 'Suspend':
      return shapeOf(ast.thunk(), depth + 1);
    case 'Objects': {
      const index = ast.indexSignatures[0];
      if (ast.propertySignatures.length === 0 && index)
        return { kind: 'record', of: shapeOf(index.type, depth + 1) };
      return {
        kind: 'struct',
        fields: ast.propertySignatures.map((signature) => ({
          name: String(signature.name),
          optional: SchemaAST.isOptional(signature.type),
          shape: shapeOf(signature.type, depth + 1),
        })),
      };
    }
    case 'Arrays':
      return ast.rest[0]
        ? { kind: 'array', of: shapeOf(ast.rest[0], depth + 1) }
        : leaf(
            `[${ast.elements.map((one) => textOf(shapeOf(one, depth + 1))).join(', ')}]`,
          );
    case 'Union': {
      const members = ast.types.map((one) => shapeOf(one, depth + 1));
      return members.length === 1 ? members[0]! : { kind: 'union', members };
    }
    case 'Literal':
      return leaf(JSON.stringify(ast.literal));
    case 'Declaration':
      return leaf(named(ast) ?? 'value');
    case 'String':
    case 'TemplateLiteral':
      return leaf('string');
    case 'Number':
      return leaf('number');
    case 'Boolean':
      return leaf('boolean');
    case 'Null':
      return leaf('null');
    case 'Undefined':
    case 'Void':
      return leaf('undefined');
    case 'BigInt':
      return leaf('bigint');
    case 'Enum':
      return leaf(named(ast) ?? 'enum');
    default:
      return leaf(named(ast) ?? 'unknown');
  }
};

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

const tagOf = (shape: Shape) => {
  if (shape.kind !== 'struct') return undefined;
  const tag = shape.fields.find(({ name }) => name === '_tag')?.shape;
  return tag?.kind === 'leaf' ? (JSON.parse(tag.text) as string) : undefined;
};

/** A tagged union's cases by tag, each with the fields it carries besides `_tag`. */
export const casesOf = (
  schema: Schema.Top | undefined,
): ReadonlyMap<string, ReadonlyArray<Field>> => {
  if (!schema) return new Map();
  const shape = shapeOf(schema.ast);
  const members = shape.kind === 'union' ? shape.members : [shape];
  return new Map(
    members.flatMap((member) => {
      const tag = tagOf(member);
      return tag === undefined
        ? []
        : [
            [
              tag,
              fieldsOf(member).filter(({ name }) => name !== '_tag'),
            ] as const,
          ];
    }),
  );
};

const shapes = new WeakMap<object, Shape>();

/** A Schema's Shape, read once. */
export const schemaShape = (
  schema: Schema.Top | undefined,
): Shape | undefined => {
  if (!schema) return undefined;
  const kept = shapes.get(schema);
  if (kept) return kept;
  const shape = shapeOf(schema.ast);
  shapes.set(schema, shape);
  return shape;
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
