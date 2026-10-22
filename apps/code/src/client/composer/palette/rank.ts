/*
 * Which entries a query finds, best first. A name that starts with the
 * query beats one that has it at a word start, which beats one that has it
 * anywhere, which beats one whose letters merely appear in order; a
 * description that has it comes last. Ties go to the shorter name.
 * `matched` holds the name's matching character offsets, for highlighting.
 */

interface Named {
  readonly name: string;
  readonly description: string;
}

export interface Ranked<T> {
  readonly entry: T;
  readonly matched: ReadonlyArray<number>;
}

export function rank<T extends Named>(
  entries: ReadonlyArray<T>,
  query: string,
): ReadonlyArray<Ranked<T>> {
  const wanted = query.toLowerCase();
  return entries
    .flatMap((entry) => {
      const found = score(entry, wanted);
      return found === null ? [] : [{ entry, ...found }];
    })
    .sort(
      (a, b) =>
        a.tier - b.tier ||
        a.entry.name.length - b.entry.name.length ||
        a.entry.name.localeCompare(b.entry.name),
    )
    .map(({ entry, matched }) => ({ entry, matched }));
}

function score(
  { name, description }: Named,
  wanted: string,
): { tier: number; matched: ReadonlyArray<number> } | null {
  if (wanted === '') return { tier: 0, matched: [] };
  const lower = name.toLowerCase();
  const run = (at: number) =>
    Array.from({ length: wanted.length }, (_, i) => at + i);
  if (lower.startsWith(wanted)) return { tier: 0, matched: run(0) };
  const atWord = wordStart(lower, wanted);
  if (atWord !== -1) return { tier: 1, matched: run(atWord) };
  const anywhere = lower.indexOf(wanted);
  if (anywhere !== -1) return { tier: 2, matched: run(anywhere) };
  const inOrder = subsequence(lower, wanted);
  if (inOrder !== null) return { tier: 3, matched: inOrder };
  if (description.toLowerCase().includes(wanted))
    return { tier: 4, matched: [] };
  return null;
}

function wordStart(name: string, wanted: string): number {
  for (
    let at = name.indexOf(wanted);
    at !== -1;
    at = name.indexOf(wanted, at + 1)
  )
    if (at > 0 && /[-_:.\s]/.test(name[at - 1]!)) return at;
  return -1;
}

function subsequence(name: string, wanted: string): Array<number> | null {
  const matched: Array<number> = [];
  let at = 0;
  for (const letter of wanted) {
    at = name.indexOf(letter, at);
    if (at === -1) return null;
    matched.push(at++);
  }
  return matched;
}
