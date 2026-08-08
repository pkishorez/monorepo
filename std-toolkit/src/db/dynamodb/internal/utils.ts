import { unmarshall } from './marshall.js';

type UnionKeys<T> = T extends T ? keyof T : never;

export const sameValue = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left, objectKeysInOrder) ===
  JSON.stringify(right, objectKeysInOrder);

const objectKeysInOrder = (_key: string, value: unknown): unknown =>
  value !== null && !Array.isArray(value) && typeof value === 'object'
    ? Object.fromEntries(
        Object.entries(value).sort(([left], [right]) =>
          left.localeCompare(right),
        ),
      )
    : value;

export const isConditionalCheckFailed = (e: {
  readonly cause?: unknown;
}): boolean => {
  if (!('cause' in e)) return false;
  const cause = e.cause as { readonly _tag?: string } | undefined;
  return cause?._tag === 'ConditionalCheckFailedException';
};

export const extractConditionFailureItem = (e: {
  readonly cause?: unknown;
}): Record<string, unknown> | undefined => {
  if (!('cause' in e)) return undefined;
  const cause = e.cause as { readonly Item?: Record<string, never> };
  return cause.Item ? unmarshall(cause.Item) : undefined;
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
