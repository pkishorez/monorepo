/*
 * Which rows a query finds, best first. A label that starts with the
 * query beats one that has it at a word start, which beats one that has it
 * anywhere, which beats one whose letters merely appear in order; a detail
 * that has it comes last. Ties go to the shorter label. With no query,
 * every row stays in the order it was given. `matched` holds the label's
 * matching character offsets, for highlighting.
 */

interface Labelled {
  readonly label: string;
  readonly detail?: string | undefined;
}

export interface Ranked<T> {
  readonly entry: T;
  readonly matched: ReadonlyArray<number>;
}

export function rank<T extends Labelled>(
  entries: ReadonlyArray<T>,
  query: string,
): ReadonlyArray<Ranked<T>> {
  const wanted = query.trim().toLowerCase();
  if (wanted === '') return entries.map((entry) => ({ entry, matched: [] }));
  return entries
    .flatMap((entry) => {
      const found = score(entry, wanted);
      return found === null ? [] : [{ entry, ...found }];
    })
    .sort(
      (a, b) =>
        a.tier - b.tier ||
        a.entry.label.length - b.entry.label.length ||
        a.entry.label.localeCompare(b.entry.label),
    )
    .map(({ entry, matched }) => ({ entry, matched }));
}

function score(
  { label, detail }: Labelled,
  wanted: string,
): { tier: number; matched: ReadonlyArray<number> } | null {
  const lower = label.toLowerCase();
  const run = (at: number) =>
    Array.from({ length: wanted.length }, (_, i) => at + i);
  if (lower.startsWith(wanted)) return { tier: 0, matched: run(0) };
  const atWord = wordStart(lower, wanted);
  if (atWord !== -1) return { tier: 1, matched: run(atWord) };
  const anywhere = lower.indexOf(wanted);
  if (anywhere !== -1) return { tier: 2, matched: run(anywhere) };
  const inOrder = subsequence(lower, wanted);
  if (inOrder !== null) return { tier: 3, matched: inOrder };
  if (detail?.toLowerCase().includes(wanted)) return { tier: 4, matched: [] };
  return null;
}

function wordStart(label: string, wanted: string): number {
  for (
    let at = label.indexOf(wanted);
    at !== -1;
    at = label.indexOf(wanted, at + 1)
  )
    if (at > 0 && /[-_:./\s]/.test(label.charAt(at - 1))) return at;
  return -1;
}

function subsequence(label: string, wanted: string): Array<number> | null {
  const matched: Array<number> = [];
  let at = 0;
  for (const letter of wanted) {
    at = label.indexOf(letter, at);
    if (at === -1) return null;
    matched.push(at++);
  }
  return matched;
}
