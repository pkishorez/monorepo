import type { JsonValue } from '../../story/schema/index.js';

export function toJsonValue(
  value: unknown,
  ancestors = new Set<object>(),
): JsonValue {
  if (value === null || value === undefined) return null;
  switch (typeof value) {
    case 'string':
      return value;
    case 'number':
      return Number.isFinite(value) ? value : String(value);
    case 'boolean':
      return value;
    case 'bigint':
    case 'function':
    case 'symbol':
      return String(value);
  }
  const object = value as object;
  if (ancestors.has(object)) return '[circular]';
  ancestors.add(object);
  const json = toJsonObject(object, ancestors);
  ancestors.delete(object);
  return json;
}

function toJsonObject(object: object, ancestors: Set<object>): JsonValue {
  if (Array.isArray(object)) {
    return object.map((item) => toJsonValue(item, ancestors));
  }
  if ('toJSON' in object && typeof object.toJSON === 'function') {
    return toJsonValue(object.toJSON(), ancestors);
  }
  if (object instanceof Map) {
    return [...object.entries()].map(([key, item]) => [
      toJsonValue(key, ancestors),
      toJsonValue(item, ancestors),
    ]);
  }
  if (object instanceof Set) {
    return [...object.values()].map((item) => toJsonValue(item, ancestors));
  }
  return Object.fromEntries(
    Object.entries(object)
      .filter(([, item]) => typeof item !== 'function')
      .map(([key, item]) => [key, toJsonValue(item, ancestors)]),
  );
}
