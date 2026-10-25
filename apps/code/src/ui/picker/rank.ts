/*
 * Which rows a query finds, best first. A row whose keys are the query,
 * such as `ctrl+b`, comes first; then a label that starts with the query
 * beats one that has it at a word start, which beats one that has it
 * anywhere, which beats one whose letters merely appear in order; a detail
 * or keys that have it come last. Keys are matched as written, with or
 * without their `+` and spaces, `mod` read as Ctrl or Cmd too. Ties go to
 * the shorter label. With no query,
 * every row stays in the order it was given. `matched` holds the label's
 * matching character offsets, for highlighting.
 */

interface Labelled {
  readonly label: string;
  readonly detail?: string | undefined;
  /** An Action's keys, out of Vim Mode and in it, as written. */
  readonly keys?:
    | {
        readonly out: ReadonlyArray<string>;
        readonly vim: ReadonlyArray<string>;
      }
    | undefined;
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
  { label, detail, keys }: Labelled,
  wanted: string,
): { tier: number; matched: ReadonlyArray<number> } | null {
  const lower = label.toLowerCase();
  const run = (at: number) =>
    Array.from({ length: wanted.length }, (_, i) => at + i);
  const pressed = compact(wanted);
  const written =
    pressed === ''
      ? []
      : [...(keys?.out ?? []), ...(keys?.vim ?? [])].flatMap(spellings);
  if (written.includes(pressed)) return { tier: -1, matched: [] };
  if (lower.startsWith(wanted)) return { tier: 0, matched: run(0) };
  const atWord = wordStart(lower, wanted);
  if (atWord !== -1) return { tier: 1, matched: run(atWord) };
  const anywhere = lower.indexOf(wanted);
  if (anywhere !== -1) return { tier: 2, matched: run(anywhere) };
  const inOrder = subsequence(lower, wanted);
  if (inOrder !== null) return { tier: 3, matched: inOrder };
  if (detail?.toLowerCase().includes(wanted)) return { tier: 4, matched: [] };
  if (written.some((each) => each.includes(pressed)))
    return { tier: 4, matched: [] };
  return null;
}

const compact = (keys: string) => keys.toLowerCase().replace(/[\s+]/g, '');

/** Keys as they may be typed: `mod+k` as `modk`, `ctrlk` and `cmdk`. */
function spellings(written: string): ReadonlyArray<string> {
  const plain = compact(written);
  return plain.includes('mod')
    ? [plain, plain.replace('mod', 'ctrl'), plain.replace('mod', 'cmd')]
    : [plain];
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
