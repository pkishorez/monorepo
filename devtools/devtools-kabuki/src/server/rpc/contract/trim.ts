const LONGEST = 160;
const FIRST = 4;
const LAST = 8;
const KEYS = 16;
const DEEPEST = 6;

const shown = (key: string) => !key.startsWith('$') && key !== '_meta';

const plainOf = (value: object): unknown => {
  if (value instanceof Date)
    return Number.isNaN(value.getTime()) ? 'Invalid Date' : value.toISOString();
  if (value instanceof Map) return [...value.entries()];
  if (value instanceof Set) return [...value.values()];
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  return value;
};

const scalarOf = (value: unknown): unknown => {
  switch (typeof value) {
    case 'string':
      return value.length > LONGEST
        ? `${value.slice(0, LONGEST)}…(${value.length} chars)`
        : value;
    case 'number':
      return Number.isFinite(value) ? value : String(value);
    case 'bigint':
      return `${value}n`;
    case 'function':
      return `ƒ ${value.name || 'anonymous'}`;
    case 'symbol':
      return value.toString();
    default:
      return value;
  }
};

const inner = (
  value: unknown,
  depth: number,
  above: ReadonlySet<object>,
): unknown => {
  if (value === null || typeof value !== 'object') return scalarOf(value);
  if (above.has(value)) return '[circular]';
  const plain = plainOf(value);
  if (plain === null || typeof plain !== 'object') return scalarOf(plain);
  const within = new Set(above).add(value);
  if (Array.isArray(plain)) {
    if (depth >= DEEPEST) return `[${plain.length} items]`;
    const each = (one: unknown) => inner(one, depth + 1, within) ?? null;
    return plain.length > FIRST + LAST
      ? [
          ...plain.slice(0, FIRST).map(each),
          `…${plain.length - FIRST - LAST} more`,
          ...plain.slice(-LAST).map(each),
        ]
      : plain.map(each);
  }
  const entries = Object.entries(plain).filter(
    ([key, one]) => shown(key) && one !== undefined,
  );
  if (depth >= DEEPEST) return `{${entries.length} keys}`;
  const kept = Object.fromEntries(
    entries
      .slice(0, KEYS)
      .map(([key, one]) => [key, inner(one, depth + 1, within)]),
  );
  return entries.length > KEYS
    ? { ...kept, '…': `${entries.length - KEYS} more keys` }
    : kept;
};

export const trimmed = (value: unknown): unknown => inner(value, 0, new Set());
