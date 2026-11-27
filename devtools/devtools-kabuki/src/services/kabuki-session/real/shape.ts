import { SchemaAST } from 'effect';
import type { Schema } from 'effect';
import type {
  Field,
  Shape,
} from '../../../server/rpc/session/contract/index.ts';

type Choice = string | number | boolean;

const DEEPEST = 6;

const json = (text: string): Shape => ({ kind: 'json', text });

const unwrapped = (ast: SchemaAST.AST): SchemaAST.AST =>
  ast._tag === 'Suspend' ? unwrapped(ast.thunk()) : ast;

const named = (ast: SchemaAST.AST): string | undefined => {
  const annotations = (
    ast as { readonly annotations?: Readonly<Record<string, unknown>> }
  ).annotations;
  const name = annotations?.['identifier'] ?? annotations?.['title'];
  return typeof name === 'string' ? name : undefined;
};

const isChoice = (value: unknown): value is Choice =>
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'boolean';

const choicesOf = (ast: SchemaAST.AST): ReadonlyArray<Choice> | undefined => {
  if (ast._tag === 'Literal')
    return isChoice(ast.literal) ? [ast.literal] : undefined;
  if (ast._tag === 'Enum') {
    const values = ast.enums.map(([, value]) => value);
    return values.every(isChoice) ? values : undefined;
  }
  return undefined;
};

const TYPED = 2;

const fieldText = (field: Field, depth: number) =>
  `${field.name}${field.optional ? '?' : ''}: ${textOf(field.shape, depth + 1)}${field.nullable ? ' | null' : ''}`;

export const textOf = (shape: Shape, depth = 0): string => {
  switch (shape.kind) {
    case 'text':
      return 'string';
    case 'number':
    case 'boolean':
      return shape.kind;
    case 'choice':
      return shape.options.map((one) => JSON.stringify(one)).join(' | ');
    case 'array': {
      const of = textOf(shape.of, depth);
      return of.includes(' | ') ? `(${of})[]` : `${of}[]`;
    }
    case 'struct':
      if (shape.fields.length === 0) return '{}';
      return depth < TYPED
        ? `{ ${shape.fields.map((field) => fieldText(field, depth)).join('; ')} }`
        : `{ ${shape.fields.map(({ name }) => name).join(', ')} }`;
    case 'json':
      return shape.text;
  }
};

interface Read {
  readonly shape: Shape;
  readonly nullable: boolean;
}

const fieldOf = (
  signature: SchemaAST.PropertySignature,
  depth: number,
): Field => {
  const { shape, nullable } = readOf(signature.type, depth + 1);
  const description = SchemaAST.resolveDescription(signature.type);
  return {
    name: String(signature.name),
    optional: SchemaAST.isOptional(signature.type),
    nullable,
    ...(description ? { description } : {}),
    shape,
  };
};

const flattened = (ast: SchemaAST.Union): ReadonlyArray<SchemaAST.AST> =>
  ast.types
    .map(unwrapped)
    .flatMap((one) => (one._tag === 'Union' ? flattened(one) : [one]));

const unionOf = (ast: SchemaAST.Union, depth: number): Read => {
  const members = flattened(ast).filter(
    (one) => one._tag !== 'Undefined' && one._tag !== 'Void',
  );
  const nullable = members.some((one) => one._tag === 'Null');
  const rest = members.filter((one) => one._tag !== 'Null');
  const choices = rest.map(choicesOf);
  if (rest.length > 0 && choices.every((one) => one !== undefined))
    return {
      shape: { kind: 'choice', options: choices.flatMap((one) => one!) },
      nullable,
    };
  if (rest.length === 1) return { ...readOf(rest[0]!, depth), nullable };
  if (rest.length === 0) return { shape: json('null'), nullable };
  return {
    shape: json(
      rest.map((one) => textOf(placed(readOf(one, depth + 1)))).join(' | '),
    ),
    nullable,
  };
};

const placed = ({ shape, nullable }: Read): Shape =>
  nullable ? json(`${textOf(shape)} | null`) : shape;

const readOf = (ast: SchemaAST.AST, depth: number): Read => {
  const plain = (shape: Shape): Read => ({ shape, nullable: false });
  if (depth > DEEPEST) return plain(json('…'));
  const here = unwrapped(ast);
  switch (here._tag) {
    case 'String':
    case 'TemplateLiteral':
      return plain({ kind: 'text' });
    case 'Number':
      return plain({ kind: 'number' });
    case 'Boolean':
      return plain({ kind: 'boolean' });
    case 'Literal':
    case 'Enum': {
      const options = choicesOf(here);
      return plain(
        options ? { kind: 'choice', options } : json(named(here) ?? 'literal'),
      );
    }
    case 'Null':
      return { shape: json('null'), nullable: true };
    case 'Union':
      return unionOf(here, depth);
    case 'Objects': {
      const index = here.indexSignatures[0];
      if (here.propertySignatures.length === 0 && index)
        return plain(
          json(
            `Record<string, ${textOf(placed(readOf(index.type, depth + 1)))}>`,
          ),
        );
      return plain({
        kind: 'struct',
        fields: here.propertySignatures.map((one) => fieldOf(one, depth)),
      });
    }
    case 'Arrays':
      return plain(
        here.rest[0] && here.elements.length === 0
          ? { kind: 'array', of: placed(readOf(here.rest[0], depth + 1)) }
          : json(
              `[${here.elements.map((one) => textOf(placed(readOf(one, depth + 1)))).join(', ')}]`,
            ),
      );
    case 'BigInt':
      return plain(json('bigint'));
    case 'Undefined':
    case 'Void':
      return plain(json('undefined'));
    default:
      return plain(json(named(here) ?? 'unknown'));
  }
};

const read = new WeakMap<Schema.Top, Shape>();

export const shapeOf = (schema: Schema.Top): Shape => {
  const kept = read.get(schema);
  if (kept) return kept;
  const shape = placed(readOf(SchemaAST.toEncoded(schema.ast), 0));
  read.set(schema, shape);
  return shape;
};

const payloads = new WeakMap<Schema.Top, Shape>();

export const payloadOf = (schema: Schema.Top): Shape => {
  const kept = payloads.get(schema);
  if (kept) return kept;
  const whole = shapeOf(schema);
  const shape: Shape =
    whole.kind === 'struct'
      ? {
          kind: 'struct',
          fields: whole.fields.filter(({ name }) => name !== '_tag'),
        }
      : whole;
  payloads.set(schema, shape);
  return shape;
};
