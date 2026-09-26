/** A key path's value: the only two things a physical key is built from. */
export type KeyPart = string | number;

/** Reads one index component — a key path or `_u` — or `undefined` when absent. */
export type KeyReader = (component: string) => KeyPart | undefined;

const isKeyPart = (value: unknown): value is KeyPart =>
  typeof value === 'string' ||
  (typeof value === 'number' && Number.isFinite(value));

/**
 * Follows a dotted key path through a value. A missing step, a `null` step, or
 * a leaf that is not a string or finite number reads as absent.
 */
export const readKeyPath = (
  value: unknown,
  path: string,
): KeyPart | undefined => {
  let current = value;
  for (const segment of path.split('.')) {
    if (current === null || typeof current !== 'object') return undefined;
    if (!Object.hasOwn(current, segment)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return isKeyPart(current) ? current : undefined;
};

/** Reads components from a value; `_u` comes from Entity Meta, not the value. */
export const valueReader =
  (value: object, updated?: string): KeyReader =>
  (component) =>
    component === '_u' ? updated : readKeyPath(value, component);

/** Reads components from a key record named by key path, such as a query operand. */
export const recordReader =
  (record: Readonly<Record<string, unknown>>): KeyReader =>
  (component) => {
    const part = Object.hasOwn(record, component)
      ? record[component]
      : undefined;
    return isKeyPart(part) ? part : undefined;
  };

const SIGN = 1n << 63n;
const MASK = (1n << 64n) - 1n;

/**
 * A number's order-preserving string: its IEEE-754 bits with the sign flipped
 * (and every bit flipped for negatives), as 16 hex digits, so that comparing
 * the strings compares the numbers.
 */
const encodeNumber = (value: number): string => {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value === 0 ? 0 : value);
  const bits = view.getBigUint64(0);
  const ordered = bits & SIGN ? ~bits & MASK : bits | SIGN;
  return ordered.toString(16).padStart(16, '0');
};

export const encodeKeyPart = (part: KeyPart): string =>
  typeof part === 'string' ? part : encodeNumber(part);
