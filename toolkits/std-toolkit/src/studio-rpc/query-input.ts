import { Effect } from 'effect';
import type { JsonObject } from '../db/std-table/contract/index.js';
import type { AccessPatternDefinition } from '../db/std-table/definition/index.js';

type KeyValues = Readonly<Record<string, string | number>>;

/** Which kind of value a key path reads, from the Entity's latest value. */
export type KeyKind = (component: string) => 'string' | 'number' | undefined;
import {
  StudioInvalidInput,
  type QueryEntitiesPayload,
  type StudioValidationIssue,
} from './protocol.js';

const exactFields = (
  value: KeyValues,
  expected: readonly string[],
  path: readonly string[],
  kindOf: KeyKind,
): readonly StudioValidationIssue[] => {
  const actual = Object.keys(value);
  const missing = expected
    .filter((field) => !Object.hasOwn(value, field))
    .map((field) => ({
      path: [...path, field],
      message: `Missing required component "${field}"`,
    }));
  const unexpected = actual
    .filter((field) => !expected.includes(field))
    .map((field) => ({
      path: [...path, field],
      message: `Unexpected component "${field}"`,
    }));
  const mistyped = expected
    .filter(
      (field) =>
        Object.hasOwn(value, field) &&
        kindOf(field) !== undefined &&
        typeof value[field] !== kindOf(field),
    )
    .map((field) => ({
      path: [...path, field],
      message: `Component "${field}" must be a ${kindOf(field)}`,
    }));
  return [...missing, ...unexpected, ...mistyped];
};

const failIssues = (issues: readonly StudioValidationIssue[]) =>
  Effect.fail(new StudioInvalidInput({ issues: [...issues] }));

export const validateEntityKey = (
  key: KeyValues | undefined,
  fields: readonly string[],
  kindOf: KeyKind,
) => {
  if (key === undefined)
    return failIssues([
      { path: ['key'], message: 'A keyed Entity requires a key' },
    ]);
  const issues = exactFields(key, fields, ['key'], kindOf);
  return issues.length === 0
    ? Effect.succeed(key as JsonObject)
    : failIssues(issues);
};

export const rejectSingletonKey = (key: KeyValues | undefined) =>
  key === undefined
    ? Effect.void
    : failIssues([
        { path: ['key'], message: 'A singleton Entity does not accept a key' },
      ]);

export const buildEntityQueryInput = (
  payload: QueryEntitiesPayload,
  pattern: AccessPatternDefinition,
  kindOf: KeyKind,
) => {
  const issues = [...exactFields(payload.pk, pattern.pk, ['pk'], kindOf)];
  if (payload.limit !== undefined && (payload.limit < 1 || payload.limit > 100))
    issues.push({
      path: ['limit'],
      message: 'Limit must be between 1 and 100',
    });
  const sk = payload.sk;
  if (sk !== undefined) {
    if (sk.operator === 'between') {
      issues.push(
        ...exactFields(sk.value[0], pattern.sk, ['sk', 'value', '0'], kindOf),
        ...exactFields(sk.value[1], pattern.sk, ['sk', 'value', '1'], kindOf),
      );
    } else if (sk.value !== null) {
      issues.push(
        ...exactFields(sk.value, pattern.sk, ['sk', 'value'], kindOf),
      );
    }
  }
  if (issues.length > 0) return failIssues(issues);
  const condition: JsonObject =
    sk === undefined
      ? { '>=': null }
      : sk.operator === 'between'
        ? { between: sk.value as readonly [JsonObject, JsonObject] }
        : { [sk.operator]: sk.value };
  return Effect.succeed({ pk: payload.pk, ...condition } as JsonObject);
};
