import { Schema } from 'effect';
import type { SchemaAST } from 'effect';

// ─── Model ──────────────────────────────────────────────────────────────────
//
// A check is display metadata: a snapshot records it so a field's checks can
// be listed, and never compares it. Built-in checks come from this fixed
// catalogue with their arguments; any other check must carry a user-supplied
// name through `checkAnnotation`.

const Custom = Schema.Struct({
  check: Schema.Literal('custom'),
  name: Schema.String,
  description: Schema.optionalKey(Schema.String),
});

export const SnapshotCheckSchema = Schema.Union([
  Schema.Struct({
    check: Schema.Literal('minLength'),
    minLength: Schema.Number,
  }),
  Schema.Struct({
    check: Schema.Literal('maxLength'),
    maxLength: Schema.Number,
  }),
  Schema.Struct({
    check: Schema.Literal('lengthBetween'),
    minimum: Schema.Number,
    maximum: Schema.Number,
  }),
  Schema.Struct({
    check: Schema.Literal('pattern'),
    source: Schema.String,
    flags: Schema.String,
  }),
  Schema.Struct({
    check: Schema.Literal('uuid'),
    version: Schema.optionalKey(Schema.Number),
  }),
  Schema.Struct({ check: Schema.Literal('int') }),
  Schema.Struct({ check: Schema.Literal('finite') }),
  Schema.Struct({
    check: Schema.Literal('greaterThan'),
    exclusiveMinimum: Schema.Number,
  }),
  Schema.Struct({
    check: Schema.Literal('greaterThanOrEqualTo'),
    minimum: Schema.Number,
  }),
  Schema.Struct({
    check: Schema.Literal('lessThan'),
    exclusiveMaximum: Schema.Number,
  }),
  Schema.Struct({
    check: Schema.Literal('lessThanOrEqualTo'),
    maximum: Schema.Number,
  }),
  Schema.Struct({
    check: Schema.Literal('between'),
    minimum: Schema.Number,
    maximum: Schema.Number,
    exclusiveMinimum: Schema.optionalKey(Schema.Boolean),
    exclusiveMaximum: Schema.optionalKey(Schema.Boolean),
  }),
  Custom,
]);
export type SnapshotCheck = typeof SnapshotCheckSchema.Type;

// ─── Custom check annotation ────────────────────────────────────────────────

const annotationKey = 'snapshotCheck';

export interface CheckDescription {
  readonly name: string;
  readonly description?: string;
}

/**
 * Names a check so a snapshot can record it. Pass the result as the
 * annotations of a filter the catalogue does not know, such as
 * `Schema.makeFilter(isSlug, checkAnnotation({ name: 'slug' }))`. It also
 * renames a built-in check, which is how two checks of one kind on the same
 * field stay distinguishable.
 */
export function checkAnnotation(description: CheckDescription): {
  readonly snapshotCheck: CheckDescription;
} {
  if (description.name === '') {
    throw new TypeError('A check name must not be empty.');
  }
  return { [annotationKey]: description };
}

// ─── Catalogue ──────────────────────────────────────────────────────────────

type Payload = Record<string, unknown>;

const number = (payload: Payload, key: string): number =>
  payload[key] as number;

const flag = (payload: Payload, key: string): { [key: string]: true } =>
  payload[key] === true ? { [key]: true } : {};

const catalogue: Record<string, (payload: Payload) => SnapshotCheck> = {
  'effect/schema/isMinLength': (p) => ({
    check: 'minLength',
    minLength: number(p, 'minLength'),
  }),
  'effect/schema/isMaxLength': (p) => ({
    check: 'maxLength',
    maxLength: number(p, 'maxLength'),
  }),
  'effect/schema/isLengthBetween': (p) => ({
    check: 'lengthBetween',
    minimum: number(p, 'minimum'),
    maximum: number(p, 'maximum'),
  }),
  'effect/schema/isPattern': (p) => ({
    check: 'pattern',
    source: String(p.source),
    flags: String(p.flags ?? ''),
  }),
  'effect/schema/isUUID': (p) =>
    typeof p.version === 'number'
      ? { check: 'uuid', version: p.version }
      : { check: 'uuid' },
  'effect/schema/isInt': () => ({ check: 'int' }),
  'effect/schema/isFinite': () => ({ check: 'finite' }),
  'effect/schema/isGreaterThan': (p) => ({
    check: 'greaterThan',
    exclusiveMinimum: number(p, 'exclusiveMinimum'),
  }),
  'effect/schema/isGreaterThanOrEqualTo': (p) => ({
    check: 'greaterThanOrEqualTo',
    minimum: number(p, 'minimum'),
  }),
  'effect/schema/isLessThan': (p) => ({
    check: 'lessThan',
    exclusiveMaximum: number(p, 'exclusiveMaximum'),
  }),
  'effect/schema/isLessThanOrEqualTo': (p) => ({
    check: 'lessThanOrEqualTo',
    maximum: number(p, 'maximum'),
  }),
  'effect/schema/isBetween': (p) => ({
    check: 'between',
    minimum: number(p, 'minimum'),
    maximum: number(p, 'maximum'),
    ...flag(p, 'exclusiveMinimum'),
    ...flag(p, 'exclusiveMaximum'),
  }),
};

// ─── Description ────────────────────────────────────────────────────────────

/** Why a node's checks cannot be recorded. */
export class CheckRefusal extends Error {
  constructor(readonly detail: string) {
    super(detail);
    this.name = 'CheckRefusal';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function customCheck(annotations: unknown): SnapshotCheck | undefined {
  const described = isRecord(annotations)
    ? annotations[annotationKey]
    : undefined;
  if (!isRecord(described) || typeof described.name !== 'string') {
    return undefined;
  }
  return typeof described.description === 'string'
    ? {
        check: 'custom',
        name: described.name,
        description: described.description,
      }
    : { check: 'custom', name: described.name };
}

function builtInCheck(annotations: unknown): SnapshotCheck | undefined {
  const representation = isRecord(annotations)
    ? annotations.representation
    : undefined;
  if (!isRecord(representation) || typeof representation.id !== 'string') {
    return undefined;
  }
  const describe = catalogue[representation.id];
  if (describe === undefined) return undefined;
  const payload = isRecord(representation.payload)
    ? representation.payload
    : {};
  return describe(payload);
}

function unknownCheckLabel(check: SchemaAST.Check<any>): string {
  const annotations = check.annotations as Record<string, unknown> | undefined;
  const representation = annotations?.representation;
  if (isRecord(representation) && typeof representation.id === 'string') {
    return representation.id;
  }
  return typeof annotations?.expected === 'string'
    ? annotations.expected
    : 'an unnamed filter';
}

function describeCheck(check: SchemaAST.Check<any>): readonly SnapshotCheck[] {
  const described =
    customCheck(check.annotations) ?? builtInCheck(check.annotations);
  if (described !== undefined) return [described];
  if (check._tag === 'FilterGroup') return check.checks.flatMap(describeCheck);
  throw new CheckRefusal(
    `check ${unknownCheckLabel(check)} is not in the check catalogue; name it with checkAnnotation({ name })`,
  );
}

/** The name a check is listed under; unique on its node. */
export function checkName(check: SnapshotCheck): string {
  return check.check === 'custom' ? check.name : check.check;
}

/**
 * Every check on one node, in declaration order. Throws `CheckRefusal` when
 * a check is neither in the catalogue nor named, or when two checks on the
 * node share a name.
 */
export function describeChecks(
  checks: readonly SchemaAST.Check<any>[] | undefined,
): readonly SnapshotCheck[] {
  const described = (checks ?? []).flatMap(describeCheck);
  const names = new Set<string>();
  for (const check of described) {
    const name = checkName(check);
    if (names.has(name)) {
      throw new CheckRefusal(
        `two checks are named "${name}"; give one a distinct name with checkAnnotation({ name })`,
      );
    }
    names.add(name);
  }
  return described;
}
