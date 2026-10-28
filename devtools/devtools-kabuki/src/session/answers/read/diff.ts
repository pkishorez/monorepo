/*
 * A unified diff of two values as JSON, line by line, as git shows one:
 * each value written out two spaces deep, the lines both share kept, the
 * rest removed or added, and only a little of what did not change around
 * each change, the rest folded to a count.
 */

export type Row =
  | { readonly kind: 'same' | 'removed' | 'added'; readonly text: string }
  | { readonly kind: 'skip'; readonly count: number };

const linesOf = (value: unknown) =>
  (JSON.stringify(value, null, 2) ?? 'undefined').split('\n');

/** The most cells the line-by-line table may take; past it, two values are too big to compare here. */
const LIMIT = 250_000;

/** Every line of both, in order, each kept, removed or added: the longest run they share is kept. */
const compare = (a: ReadonlyArray<string>, b: ReadonlyArray<string>) => {
  const rows: Array<{ kind: 'same' | 'removed' | 'added'; text: string }> = [];
  // The lines both begin and end with are kept as they are; only the middle is compared.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let end = 0;
  while (
    end < a.length - start &&
    end < b.length - start &&
    a[a.length - 1 - end] === b[b.length - 1 - end]
  )
    end++;
  const x = a.slice(start, a.length - end);
  const y = b.slice(start, b.length - end);
  for (const text of a.slice(0, start)) rows.push({ kind: 'same', text });
  if (x.length * y.length > LIMIT) {
    for (const text of x) rows.push({ kind: 'removed', text });
    for (const text of y) rows.push({ kind: 'added', text });
  } else {
    // How long a run the rest of each shares, from each pair of lines on.
    const table = Array.from(
      { length: x.length + 1 },
      () => new Uint32Array(y.length + 1),
    );
    for (let i = x.length - 1; i >= 0; i--)
      for (let j = y.length - 1; j >= 0; j--)
        table[i]![j] =
          x[i] === y[j]
            ? table[i + 1]![j + 1]! + 1
            : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    let i = 0;
    let j = 0;
    while (i < x.length || j < y.length) {
      if (i < x.length && j < y.length && x[i] === y[j]) {
        rows.push({ kind: 'same', text: x[i]! });
        i++;
        j++;
      } else if (
        i < x.length &&
        (j === y.length || table[i + 1]![j]! >= table[i]![j + 1]!)
      ) {
        // As git shows it: what went, before what came.
        rows.push({ kind: 'removed', text: x[i]! });
        i++;
      } else {
        rows.push({ kind: 'added', text: y[j]! });
        j++;
      }
    }
  }
  for (const text of a.slice(a.length - end)) rows.push({ kind: 'same', text });
  return rows;
};

/** Two values as a unified diff: each change with `context` lines around it, the rest folded. */
export const unified = (
  before: unknown,
  after: unknown,
  context = 2,
): ReadonlyArray<Row> => {
  const rows = compare(linesOf(before), linesOf(after));
  const near = rows.map((_, index) =>
    rows
      .slice(Math.max(0, index - context), index + context + 1)
      .some((row) => row.kind !== 'same'),
  );
  const out: Row[] = [];
  let folded: Row[] = [];
  // A run of one is shown as it is: folding it saves no room.
  const settle = () => {
    if (folded.length === 1) out.push(folded[0]!);
    else if (folded.length > 1)
      out.push({ kind: 'skip', count: folded.length });
    folded = [];
  };
  rows.forEach((row, index) => {
    if (near[index]) {
      settle();
      out.push(row);
    } else folded.push(row);
  });
  settle();
  return out;
};
