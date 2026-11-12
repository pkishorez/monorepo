import { SchemaAST } from 'effect';
import type { Schema } from 'effect';

/*
 * A Schema as the card draws it: fields and their types, as far down as a
 * card has room for. Read from the Schemas an Actor's Blueprint holds: its
 * Model and Props as trees, each State's and Message's case with the
 * fields it carries.
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
