export type Scalar = string | number | boolean | null;
export type KeyValue = { key: string; value: Scalar };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const isScalar = (value: unknown): value is Scalar =>
  value === null || ['string', 'number', 'boolean'].includes(typeof value);

/**
 * Scalars reachable from `value` as dotted keys, two levels deep. Arrays and
 * deeper objects are left to the JSON dialog; a short list of scalars is
 * joined so it still reads in one cell.
 */
export function flattenScalars(value: unknown, depth = 2): KeyValue[] {
  if (!isRecord(value)) return [];
  const rows: KeyValue[] = [];
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined) continue;
    if (isScalar(item)) rows.push({ key, value: item });
    else if (Array.isArray(item)) {
      if (item.length > 0 && item.length <= 5 && item.every(isScalar))
        rows.push({ key, value: item.map(String).join(', ') });
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
