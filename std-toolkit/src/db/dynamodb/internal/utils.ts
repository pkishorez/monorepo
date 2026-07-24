import type { DynamodbError } from '../errors.js';
import { stableStringify } from '../../../snapshot/internal/stable-stringify.js';

type UnionKeys<T> = T extends T ? keyof T : never;

export const sameValue = (left: unknown, right: unknown): boolean =>
  stableStringify(left) === stableStringify(right);

export const isConditionalCheckFailed = (e: DynamodbError): boolean => {
  if (!('cause' in e.error)) return false;
  const cause = e.error.cause as DynamodbError | undefined;
  return (
    cause?.error._tag === 'UnknownAwsError' &&
    cause.error.name === 'ConditionalCheckFailedException'
  );
};

export const extractConditionFailureItem = (
  e: DynamodbError,
): Record<string, unknown> | undefined => {
  if (!('cause' in e.error)) return undefined;
  const cause = e.error.cause as any;
  return cause?.conditionFailureItem;
};

export const extractTableKey = (
  item: Record<string, unknown>,
  primary: { pk: string; sk: string },
): { pk: string; sk: string } | undefined => {
  const pk = item[primary.pk];
  const sk = item[primary.sk];
  if (typeof pk !== 'string' || typeof sk !== 'string') return undefined;
  return { pk, sk };
};

/**
 * Converts a record with a single key-value pair to a discriminated union object.
 */
export function toDiscriminatedGeneric<
  T extends Record<string, any>,
  K extends UnionKeys<T> = UnionKeys<T>,
>(obj: T): { type: K; value: T[K] } {
  const key = Object.keys(obj)[0] as K;
  return { type: key, value: obj[key] };
}

/**
 * Converts a discriminated union object back to a record with a single key-value pair.
 */
export function fromDiscriminatedGeneric<K extends string, V>(discriminated: {
  type: K;
  value: V;
}): Record<K, V> {
  return { [discriminated.type]: discriminated.value } as Record<K, V>;
}
