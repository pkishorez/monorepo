import type { AttributeValue, MarshalledOutput } from '../../types/index.js';

export function marshall(value: unknown): MarshalledOutput {
  if (value === null || value === undefined || typeof value !== 'object') {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, toAttributeValue(item)]),
  );
}

export function toAttributeValue(value: unknown): AttributeValue {
  if (value === null || value === undefined) return { NULL: true };
  if (typeof value === 'string') return { S: value };
  if (typeof value === 'number') return { N: String(value) };
  if (typeof value === 'boolean') return { BOOL: value };
  if (Array.isArray(value)) return { L: value.map(toAttributeValue) };
  if (typeof value === 'object') {
    return {
      M: Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          toAttributeValue(item),
        ]),
      ),
    };
  }
  return { NULL: true };
}

export function unmarshall(value: MarshalledOutput): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, fromAttributeValue(item)]),
  );
}

export function fromAttributeValue(value: AttributeValue): unknown {
  if ('S' in value) return value.S;
  if ('N' in value) return Number(value.N);
  if ('BOOL' in value) return value.BOOL;
  if ('NULL' in value) return null;
  if ('L' in value) return value.L.map(fromAttributeValue);
  if ('M' in value) {
    return Object.fromEntries(
      Object.entries(value.M).map(([key, item]) => [
        key,
        fromAttributeValue(item),
      ]),
    );
  }
  if ('SS' in value) return value.SS;
  if ('NS' in value) return value.NS.map(Number);
  if ('BS' in value) return value.BS;
  return null;
}

export type { AttributeValue, MarshalledOutput };
