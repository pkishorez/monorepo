import type { AttributeValue } from '@std-toolkit/dynamodb-client';
import {
  convertToAttr as convertToAttr_,
  marshall as marshall_,
  unmarshall as unmarshall_,
} from '@aws-sdk/util-dynamodb';

export type MarshalledOutput = Record<string, AttributeValue>;
export function marshall(value: unknown): MarshalledOutput {
  return marshall_(value);
}

export function convertToAttr(value: unknown): AttributeValue {
  return convertToAttr_(value) as any;
}

export function unmarshall(value: MarshalledOutput): Record<string, unknown> {
  return unmarshall_(value as any);
}

// Type helper functions.
// Generic type to extract keys from a union
type UnionKeys<T> = T extends T ? keyof T : never;

// Generic converter (works for simple cases)
export function toDiscriminatedGeneric<
  T extends Record<string, any>,
  K extends UnionKeys<T> = UnionKeys<T>,
>(obj: T): { type: K; value: T[K] } {
  const key = Object.keys(obj)[0] as K;
  return { type: key, value: obj[key] };
}

// Convert discriminated union to key-based union
export function fromDiscriminatedGeneric<K extends string, V>(discriminated: {
  type: K;
  value: V;
}): Record<K, V> {
  return { [discriminated.type]: discriminated.value } as Record<K, V>;
}
