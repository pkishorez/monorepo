import { Schema, SchemaAST } from 'effect';
import { inspectESchemaComposition } from '../introspection/index.js';
import {
  CheckRefusal,
  describeChecks,
  SnapshotCheckSchema,
  type SnapshotCheck,
} from './check-catalogue/index.js';

// ─── Model ──────────────────────────────────────────────────────────────────
//
// The toolkit's own language for a data shape. A table snapshot stores it in
// place of Effect's schema representation, so a change in how Effect
// describes itself can never alter a stored snapshot. It describes the
// encoded side only: what a row looks like at rest.

/**
 * Display metadata a node may carry: its checks, and the Entity its value
 * identifies. Neither changes what is stored.
 */
type Checked = {
  readonly checks?: readonly SnapshotCheck[];
  readonly entityReference?: string;
};

export interface SnapshotStructField {
  readonly name: string;
  readonly optional?: true;
  readonly type: SnapshotType;
}

export type SnapshotType =
  | ({ readonly type: 'string' } & Checked)
  | ({ readonly type: 'number' } & Checked)
  | ({ readonly type: 'boolean' } & Checked)
  | ({ readonly type: 'null' } & Checked)
  | ({ readonly type: 'unknown' } & Checked)
  | ({
      readonly type: 'literal';
      readonly value: string | number | boolean;
    } & Checked)
  | ({
      readonly type: 'struct';
      readonly fields: readonly SnapshotStructField[];
    } & Checked)
  | ({ readonly type: 'array'; readonly element: SnapshotType } & Checked)
  | ({ readonly type: 'record'; readonly value: SnapshotType } & Checked)
  | ({
      readonly type: 'union';
      readonly members: readonly SnapshotType[];
    } & Checked)
  | { readonly type: 'ref'; readonly identity: string }
  | { readonly type: 'recursive'; readonly body: SnapshotType }
  | { readonly type: 'recurse'; readonly depth: number };

const annotations = {
  checks: Schema.optionalKey(Schema.Array(SnapshotCheckSchema)),
  entityReference: Schema.optionalKey(Schema.String),
};

export const SnapshotTypeSchema: Schema.Codec<SnapshotType> = Schema.suspend(
  (): Schema.Codec<SnapshotType> =>
    Schema.Union([
      Schema.Struct({ type: Schema.Literal('string'), ...annotations }),
      Schema.Struct({ type: Schema.Literal('number'), ...annotations }),
      Schema.Struct({ type: Schema.Literal('boolean'), ...annotations }),
      Schema.Struct({ type: Schema.Literal('null'), ...annotations }),
      Schema.Struct({ type: Schema.Literal('unknown'), ...annotations }),
      Schema.Struct({
        type: Schema.Literal('literal'),
        value: Schema.Union([Schema.String, Schema.Number, Schema.Boolean]),
        ...annotations,
      }),
      Schema.Struct({
        type: Schema.Literal('struct'),
        fields: Schema.Array(
          Schema.Struct({
            name: Schema.String,
            optional: Schema.optionalKey(Schema.Literal(true)),
            type: SnapshotTypeSchema,
          }),
        ),
        ...annotations,
      }),
      Schema.Struct({
        type: Schema.Literal('array'),
        element: SnapshotTypeSchema,
        ...annotations,
      }),
      Schema.Struct({
        type: Schema.Literal('record'),
        value: SnapshotTypeSchema,
        ...annotations,
      }),
      Schema.Struct({
        type: Schema.Literal('union'),
        members: Schema.Array(SnapshotTypeSchema),
        ...annotations,
      }),
      Schema.Struct({ type: Schema.Literal('ref'), identity: Schema.String }),
      Schema.Struct({
        type: Schema.Literal('recursive'),
        body: SnapshotTypeSchema,
      }),
      Schema.Struct({ type: Schema.Literal('recurse'), depth: Schema.Number }),
    ]) as unknown as Schema.Codec<SnapshotType>,
);

// ─── Refusal ────────────────────────────────────────────────────────────────

/** Where and why a schema's encoded side has no snapshot type. */
export interface UndescribableField {
  readonly path: string;
  readonly reason: 'type' | 'check';
  readonly detail: string;
}

class Refusal extends Error {
  constructor(readonly field: UndescribableField) {
    super(`${field.path}: ${field.detail}`);
  }
}

const refuse = (path: string, detail: string): never => {
  throw new Refusal({ path: path || '/', reason: 'type', detail });
};

// ─── Description ────────────────────────────────────────────────────────────

/**
 * One enclosing `Schema.suspend` while its body is described. A suspend is
 * transparent unless something inside refers back to the schema it resolves to, in which case it
 * becomes a `recursive` binder and each back-reference a `recurse` node
 * counting binders outward, so no generated name ever enters a snapshot.
 */
interface Frame {
  readonly target: SchemaAST.AST;
  used: boolean;
}

/**
 * The state of one description. Inside a conversion's encoded side, checks
 * belong to the conversion (`BigIntFromString` checks its string), not to
 * the user, so they are neither recorded nor refused.
 */
interface Walk {
  readonly frames: Frame[];
  readonly insideConversion: boolean;
}

const binders = new WeakMap<object, Frame>();
const backReferences = new WeakMap<object, Frame>();

function withChecks<T extends SnapshotType>(
  node: T,
  ast: SchemaAST.AST,
  path: string,
  walk: Walk,
): T {
  if (walk.insideConversion) return node;
  let described: readonly SnapshotCheck[];
  try {
    described = describeChecks(ast.checks);
  } catch (cause) {
    if (!(cause instanceof CheckRefusal)) throw cause;
    throw new Refusal({
      path: path || '/',
      reason: 'check',
      detail: cause.detail,
    });
  }
  if (described.length === 0) return node;
  if (
    node.type === 'ref' ||
    node.type === 'recursive' ||
    node.type === 'recurse'
  ) {
    throw new Refusal({
      path: path || '/',
      reason: 'check',
      detail:
        'a check on a nested ESchema or a recursive schema is not supported',
    });
  }
  return { ...node, checks: described };
}

function entityReferenceOf(ast: SchemaAST.AST): string | undefined {
  const target = (ast.annotations as Record<string, unknown> | undefined)
    ?.entityReference;
  return typeof target === 'string' && target.length > 0 ? target : undefined;
}

/**
 * Keeps an `entityReference` annotation, declared with
 * `.annotate({ entityReference: 'User' })`, on the node it describes.
 */
function withEntityReference(
  node: SnapshotType,
  ast: SchemaAST.AST,
): SnapshotType {
  const target = entityReferenceOf(ast);
  if (
    target === undefined ||
    node.type === 'ref' ||
    node.type === 'recursive' ||
    node.type === 'recurse' ||
    node.entityReference !== undefined
  ) {
    return node;
  }
  return { ...node, entityReference: target };
}

function union(members: readonly SnapshotType[]): SnapshotType {
  const flat = members.flatMap((member) =>
    member.type === 'union' && member.checks === undefined
      ? member.members
      : [member],
  );
  return flat.length === 1 ? flat[0]! : { type: 'union', members: flat };
}

function encodedEnd(ast: SchemaAST.AST): SchemaAST.AST {
  let current = ast;
  while (current.encoding !== undefined) {
    current = current.encoding[current.encoding.length - 1]!.to;
  }
  return current;
}

function describeStruct(
  ast: SchemaAST.Objects,
  path: string,
  walk: Walk,
): SnapshotType {
  if (ast.indexSignatures.length > 0) {
    const [signature] = ast.indexSignatures;
    if (
      ast.indexSignatures.length > 1 ||
      ast.propertySignatures.length > 0 ||
      !SchemaAST.isString(signature!.parameter) ||
      signature!.parameter.checks !== undefined
    ) {
      refuse(path, 'only a record with plain string keys is supported');
    }
    return withChecks(
      {
        type: 'record',
        value: describe(signature!.type, `${path}/{}`, walk),
      },
      ast,
      path,
      walk,
    );
  }
  const fields = ast.propertySignatures.map((property): SnapshotStructField => {
    if (typeof property.name !== 'string') {
      refuse(path, 'a struct key must be a string');
    }
    const name = property.name as string;
    const fieldPath = `${path}/${name}`;
    const optional =
      SchemaAST.isOptional(property.type) ||
      SchemaAST.isOptional(encodedEnd(property.type));
    const type = describe(property.type, fieldPath, walk);
    return optional ? { name, optional: true, type } : { name, type };
  });
  return withChecks(
    {
      type: 'struct',
      fields: fields.toSorted((a, b) =>
        a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
      ),
    },
    ast,
    path,
    walk,
  );
}

function describeSuspend(
  ast: SchemaAST.Suspend,
  path: string,
  walk: Walk,
): SnapshotType {
  // Keyed on what the suspend resolves to, so two suspends of one schema
  // close the same loop instead of unrolling it once.
  const target = ast.thunk();
  const enclosing = walk.frames.find((frame) => frame.target === target);
  if (enclosing !== undefined) {
    enclosing.used = true;
    const reference: SnapshotType = { type: 'recurse', depth: -1 };
    backReferences.set(reference, enclosing);
    return reference;
  }
  const frame: Frame = { target, used: false };
  walk.frames.push(frame);
  const body = describe(target, path, walk);
  walk.frames.pop();
  if (!frame.used) return body;
  const binder: SnapshotType = { type: 'recursive', body };
  binders.set(binder, frame);
  return binder;
}

function describe(ast: SchemaAST.AST, path: string, walk: Walk): SnapshotType {
  return withEntityReference(describeNode(ast, path, walk), ast);
}

function describeNode(
  ast: SchemaAST.AST,
  path: string,
  walk: Walk,
): SnapshotType {
  const composition = inspectESchemaComposition(ast);
  if (composition !== undefined) {
    return { type: 'ref', identity: composition.identity };
  }
  if (ast.context?.constructorDefault !== undefined) {
    return refuse(
      path,
      'a constructor default changes what is written without appearing in the stored shape',
    );
  }
  // A transformation's decoded side is free to change; only its encoded end
  // reaches storage, so checks on the decoded side are not recorded.
  if (ast.encoding !== undefined)
    return describe(encodedEnd(ast), path, { ...walk, insideConversion: true });

  switch (ast._tag) {
    case 'String':
      return withChecks({ type: 'string' }, ast, path, walk);
    case 'Number':
      return withChecks({ type: 'number' }, ast, path, walk);
    case 'Boolean':
      return withChecks({ type: 'boolean' }, ast, path, walk);
    case 'Null':
      return withChecks({ type: 'null' }, ast, path, walk);
    case 'Unknown':
      // An opaque value (`fromType`): stored as given, its shape unguarded.
      return withChecks({ type: 'unknown' }, ast, path, walk);
    case 'Literal':
      if (typeof ast.literal === 'bigint') {
        return refuse(path, 'a bigint literal has no JSON form');
      }
      return withChecks(
        { type: 'literal', value: ast.literal },
        ast,
        path,
        walk,
      );
    case 'Enum':
      // Only an enum's values reach storage, so it is the union of its values.
      return withChecks(
        union(ast.enums.map(([, value]) => ({ type: 'literal', value }))),
        ast,
        path,
        walk,
      );
    case 'Union':
      return withChecks(
        union(
          ast.types.map((member, index) =>
            describe(member, `${path}/${index}`, walk),
          ),
        ),
        ast,
        path,
        walk,
      );
    case 'Objects':
      return describeStruct(ast, path, walk);
    case 'Arrays':
      if (ast.elements.length > 0 || ast.rest.length !== 1) {
        return refuse(path, 'a tuple is not supported yet; use an array');
      }
      return withChecks(
        {
          type: 'array',
          element: describe(ast.rest[0]!, `${path}/[]`, walk),
        },
        ast,
        path,
        walk,
      );
    case 'Suspend':
      return describeSuspend(ast, path, walk);
    case 'Declaration':
      return refuse(
        path,
        'a declared type has no JSON form; transform it to a supported shape',
      );
    default:
      return refuse(path, `${ast._tag} has no snapshot type`);
  }
}

/** Replaces each back-reference's frame with its distance to the binder. */
function resolveRecursion(
  node: SnapshotType,
  enclosing: readonly Frame[] = [],
): SnapshotType {
  switch (node.type) {
    case 'recursive': {
      const frame = binders.get(node)!;
      return {
        type: 'recursive',
        body: resolveRecursion(node.body, [...enclosing, frame]),
      };
    }
    case 'recurse': {
      const frame = backReferences.get(node);
      if (frame === undefined) return node;
      return {
        type: 'recurse',
        depth: enclosing.length - 1 - enclosing.lastIndexOf(frame),
      };
    }
    case 'struct':
      return {
        ...node,
        fields: node.fields.map((field) => ({
          ...field,
          type: resolveRecursion(field.type, enclosing),
        })),
      };
    case 'array':
      return { ...node, element: resolveRecursion(node.element, enclosing) };
    case 'record':
      return { ...node, value: resolveRecursion(node.value, enclosing) };
    case 'union':
      return {
        ...node,
        members: node.members.map((member) =>
          resolveRecursion(member, enclosing),
        ),
      };
    default:
      return node;
  }
}

/**
 * The snapshot type of a schema's encoded side. A nested ESchema becomes a
 * reference to its identity. Throws when the encoded side is anything a
 * snapshot cannot describe; use `findUndescribableField` to ask first.
 */
export function describeSnapshotType(ast: SchemaAST.AST): SnapshotType {
  return resolveRecursion(
    describe(ast, '', { frames: [], insideConversion: false }),
  );
}

/** The first part of a schema's encoded side a snapshot cannot describe. */
export function findUndescribableField(
  ast: SchemaAST.AST,
): UndescribableField | undefined {
  try {
    describeSnapshotType(ast);
    return undefined;
  } catch (cause) {
    if (cause instanceof Refusal) return cause.field;
    throw cause;
  }
}
