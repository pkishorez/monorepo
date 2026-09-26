import { SchemaAST } from 'effect';
import type { AnyEntityESchema } from '../../../eschema/index.js';

type Leaf = 'string' | 'number';

type Resolved =
  | {
      readonly kind: 'found';
      readonly leaves: ReadonlySet<Leaf>;
      readonly absent: boolean;
    }
  | { readonly kind: 'missing' }
  | { readonly kind: 'refused'; readonly reason: string };

const found = (leaf: Leaf): Resolved => ({
  kind: 'found',
  leaves: new Set([leaf]),
  absent: false,
});
const absent: Resolved = { kind: 'found', leaves: new Set(), absent: true };
const missing: Resolved = { kind: 'missing' };
const refused = (reason: string): Resolved => ({ kind: 'refused', reason });

const leafOf = (ast: SchemaAST.AST): Leaf | undefined => {
  if (SchemaAST.isString(ast) || SchemaAST.isTemplateLiteral(ast))
    return 'string';
  if (SchemaAST.isNumber(ast)) return 'number';
  if (SchemaAST.isLiteral(ast)) {
    if (typeof ast.literal === 'string') return 'string';
    if (typeof ast.literal === 'number') return 'number';
    return undefined;
  }
  if (SchemaAST.isEnum(ast)) {
    const kinds = new Set(ast.enums.map(([, value]) => typeof value));
    if (kinds.size !== 1) return undefined;
    return kinds.has('string')
      ? 'string'
      : kinds.has('number')
        ? 'number'
        : undefined;
  }
  return undefined;
};

const combine = (results: readonly Resolved[]): Resolved => {
  const refusal = results.find((result) => result.kind === 'refused');
  if (refusal !== undefined) return refusal;
  const hits = results.filter((result) => result.kind === 'found');
  if (hits.length === 0) return missing;
  return {
    kind: 'found',
    leaves: new Set(hits.flatMap((hit) => [...hit.leaves])),
    absent: hits.length < results.length || hits.some((hit) => hit.absent),
  };
};

const resolve = (ast: SchemaAST.AST, segments: readonly string[]): Resolved => {
  if (SchemaAST.isSuspend(ast)) return resolve(ast.thunk(), segments);
  if (SchemaAST.isUnion(ast))
    return combine(ast.types.map((member) => resolve(member, segments)));
  if (SchemaAST.isNull(ast)) return absent;
  const [head, ...rest] = segments;
  if (head === undefined) {
    const leaf = leafOf(ast);
    return leaf === undefined
      ? refused(`ends at a ${ast._tag}, not a string or number`)
      : found(leaf);
  }
  if (SchemaAST.isObjects(ast)) {
    const property = ast.propertySignatures.find(
      (candidate) => candidate.name === head,
    );
    if (property !== undefined) {
      const reached = resolve(property.type, rest);
      // An optional property may be left out of a valid value.
      return SchemaAST.isOptional(property.type)
        ? combine([reached, absent])
        : reached;
    }
    return ast.indexSignatures.length > 0
      ? refused('passes through a record')
      : missing;
  }
  if (SchemaAST.isArrays(ast)) return refused('passes through an array');
  if (SchemaAST.isDeclaration(ast))
    return refused('passes through a converted or declared value');
  return missing;
};

const resolvePath = (schema: AnyEntityESchema, path: string) =>
  resolve(SchemaAST.toType(schema.schema.ast), path.split('.'));

/** Whether a valid key path reads a string or a number; `_u` is a string. */
export const keyPathKind = (
  schema: AnyEntityESchema,
  path: string,
): Leaf | undefined => {
  if (path === '_u') return 'string';
  const result = resolvePath(schema, path);
  return result.kind === 'found' && result.leaves.size === 1
    ? [...result.leaves][0]
    : undefined;
};

/**
 * Checks a key path against an Entity's latest value. It must reach a string
 * or number (not a mix of both); a primary component must also exist, non-null,
 * in every union branch. Returns the reason it is refused, if any.
 */
export const keyPathRefusal = (
  schema: AnyEntityESchema,
  path: string,
  options: { readonly total: boolean },
): string | undefined => {
  if (path === '_v') return 'is reserved';
  const result = resolvePath(schema, path);
  if (result.kind === 'refused') return result.reason;
  if (result.kind === 'missing' || result.leaves.size === 0)
    return 'does not exist in the value';
  if (result.leaves.size > 1) return 'mixes strings and numbers';
  if (options.total && result.absent)
    return 'is missing or null in some values, but a primary key needs it in every value';
  return undefined;
};
