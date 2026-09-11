export type Scalar = string | number | boolean | null;
export type KeyValue = { key: string; value: Scalar | ReadonlyArray<Scalar> };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const isScalar = (value: unknown): value is Scalar =>
  value === null || ['string', 'number', 'boolean'].includes(typeof value);

/**
 * Scalars reachable from `value` as dotted keys, two levels deep. Deeper
 * objects and long or mixed arrays are left to the JSON dialog; a short list
 * of scalars is kept as a list so each item can render on its own line.
 */
export function flattenScalars(value: unknown, depth = 2): KeyValue[] {
  if (!isRecord(value)) return [];
  const rows: KeyValue[] = [];
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined) continue;
    if (isScalar(item)) rows.push({ key, value: item });
    else if (Array.isArray(item)) {
      if (item.length > 0 && item.length <= 5 && item.every(isScalar))
        rows.push({ key, value: item });
    } else if (depth > 1)
      for (const nested of flattenScalars(item, depth - 1))
        rows.push({ key: `${key}.${nested.key}`, value: nested.value });
  }
  return rows;
}

export function isHttpUrl(value: Scalar): value is string {
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

/** Plain-text form of a value for the clipboard; `null` copies nothing. */
export function clipboardText(value: KeyValue['value']): string | null {
  if (value === null) return null;
  if (Array.isArray(value)) return value.map(String).join('\n');
  return String(value);
}
