const LARGE = 8_000;
const DEPTH = 3;
const STRING = 200;
const ITEMS = 20;

interface Folded {
  readonly value: unknown;
  readonly folded: boolean;
}

export const fold = (value: unknown): Folded => {
  if ((JSON.stringify(value) ?? '').length <= LARGE)
    return { value, folded: false };
  let folded = false;
  const inner = (part: unknown, depth: number): unknown => {
    if (typeof part === 'string' && part.length > STRING) {
      folded = true;
      return `${part.slice(0, STRING)}… (${part.length} characters)`;
    }
    if (typeof part !== 'object' || part === null) return part;
    if (depth >= DEPTH) {
      folded = true;
      return Array.isArray(part)
        ? `[… ${part.length} items]`
        : `{… ${Object.keys(part).length} keys}`;
    }
    if (Array.isArray(part)) {
      const items = part.slice(0, ITEMS).map((one) => inner(one, depth + 1));
      if (part.length <= ITEMS) return items;
      folded = true;
      return [...items, `… ${part.length - ITEMS} more items`];
    }
    return Object.fromEntries(
      Object.entries(part).map(([key, one]) => [key, inner(one, depth + 1)]),
    );
  };
  const made = inner(value, 0);
  return { value: made, folded };
};
