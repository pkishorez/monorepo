const LONGEST = 160;
const FIRST = 4;
const LAST = 8;
const KEYS = 16;
const DEEPEST = 6;

export const trimmed = (value: unknown, depth = 0): unknown => {
  if (typeof value === 'string')
    return value.length > LONGEST
      ? `${value.slice(0, LONGEST)}…(${value.length} chars)`
      : value;
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    if (depth >= DEEPEST) return `[${value.length} items]`;
    const each = (one: unknown) => trimmed(one, depth + 1);
    return value.length > FIRST + LAST
      ? [
          ...value.slice(0, FIRST).map(each),
          `…${value.length - FIRST - LAST} more`,
          ...value.slice(-LAST).map(each),
        ]
      : value.map(each);
  }
  const entries = Object.entries(value).filter(
    ([key]) => !key.startsWith('$') && key !== '_meta',
  );
  if (depth >= DEEPEST) return `{${entries.length} keys}`;
  const kept = Object.fromEntries(
    entries.slice(0, KEYS).map(([key, one]) => [key, trimmed(one, depth + 1)]),
  );
  return entries.length > KEYS
    ? { ...kept, '…': `${entries.length - KEYS} more keys` }
    : kept;
};

export const changedOf = (before: unknown, after: unknown) => {
  if (
    before === null ||
    after === null ||
    typeof before !== 'object' ||
    typeof after !== 'object' ||
    Array.isArray(after)
  )
    return JSON.stringify(before) === JSON.stringify(after)
      ? undefined
      : trimmed(after);
  const was = before as Readonly<Record<string, unknown>>;
  const changed = Object.entries(after).filter(
    ([key, one]) => JSON.stringify(was[key]) !== JSON.stringify(one),
  );
  return changed.length === 0
    ? undefined
    : trimmed(Object.fromEntries(changed));
};
