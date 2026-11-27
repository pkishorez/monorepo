export interface DiffLine {
  readonly kind: 'context' | 'added' | 'removed';
  readonly content: string;
  readonly oldNumber?: number;
  readonly newNumber?: number;
}

export interface JsonDiff {
  readonly path: string;
  readonly hunks: ReadonlyArray<{
    readonly header: string;
    readonly oldStart: number;
    readonly newStart: number;
    readonly lines: ReadonlyArray<DiffLine>;
  }>;
}

const MOST_CELLS = 4_000_000;

const linesOf = (value: unknown): ReadonlyArray<string> =>
  value === undefined
    ? []
    : (JSON.stringify(value, null, 2) ?? String(value)).split('\n');

const wholesale = (
  before: ReadonlyArray<string>,
  after: ReadonlyArray<string>,
): ReadonlyArray<DiffLine> => [
  ...before.map((content, index) => ({
    kind: 'removed' as const,
    content,
    oldNumber: index + 1,
  })),
  ...after.map((content, index) => ({
    kind: 'added' as const,
    content,
    newNumber: index + 1,
  })),
];

const matched = (
  before: ReadonlyArray<string>,
  after: ReadonlyArray<string>,
): ReadonlyArray<DiffLine> => {
  const rows = before.length;
  const columns = after.length;
  const common = Array.from(
    { length: rows + 1 },
    () => new Uint32Array(columns + 1),
  );
  for (let row = rows - 1; row >= 0; row--)
    for (let column = columns - 1; column >= 0; column--)
      common[row]![column] =
        before[row] === after[column]
          ? common[row + 1]![column + 1]! + 1
          : Math.max(common[row + 1]![column]!, common[row]![column + 1]!);
  const lines: Array<DiffLine> = [];
  let row = 0;
  let column = 0;
  while (row < rows || column < columns) {
    if (row < rows && column < columns && before[row] === after[column]) {
      lines.push({
        kind: 'context',
        content: before[row]!,
        oldNumber: row + 1,
        newNumber: column + 1,
      });
      row++;
      column++;
    } else if (
      row < rows &&
      (column === columns ||
        common[row + 1]![column]! >= common[row]![column + 1]!)
    ) {
      lines.push({
        kind: 'removed',
        content: before[row]!,
        oldNumber: row + 1,
      });
      row++;
    } else {
      lines.push({
        kind: 'added',
        content: after[column]!,
        newNumber: column + 1,
      });
      column++;
    }
  }
  return lines;
};

export const jsonDiff = (before: unknown, after: unknown): JsonDiff => {
  const old = linesOf(before);
  const now = linesOf(after);
  return {
    path: 'value.json',
    hunks: [
      {
        header: `@@ -1,${old.length} +1,${now.length} @@`,
        oldStart: 1,
        newStart: 1,
        lines:
          old.length * now.length > MOST_CELLS
            ? wholesale(old, now)
            : matched(old, now),
      },
    ],
  };
};
