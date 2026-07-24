import type { TestValue } from 'laymos/report';

import { cn } from '#lib/utils';

interface DiffLine {
  readonly kind: 'same' | 'removed' | 'added';
  readonly value: string;
}

export function ValueDiff({
  expected,
  actual,
}: {
  readonly expected: TestValue;
  readonly actual: TestValue;
}) {
  const lines = lineDiff(valueText(expected), valueText(actual));

  return (
    <div className="overflow-hidden rounded-md border bg-muted/10">
      <div className="flex items-center gap-3 border-b px-3 py-1.5 text-[10px] text-muted-foreground">
        <span>
          <span className="text-destructive">−</span> Expected
        </span>
        <span>
          <span className="text-emerald-600">+</span> Actual
        </span>
      </div>
      <pre className="max-h-80 overflow-auto py-1 font-mono text-xs">
        {lines.map((line, index) => (
          <span
            key={`${line.kind}:${index}`}
            className={cn(
              'block min-h-5 whitespace-pre-wrap px-3',
              line.kind === 'removed' && 'bg-destructive/10 text-destructive',
              line.kind === 'added' && 'bg-emerald-500/10 text-emerald-700',
            )}
          >
            <span className="mr-2 inline-block w-2 select-none opacity-70">
              {line.kind === 'removed'
                ? '−'
                : line.kind === 'added'
                  ? '+'
                  : ' '}
            </span>
            {line.value || ' '}
          </span>
        ))}
      </pre>
    </div>
  );
}

function valueText(value: TestValue): string {
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

function lineDiff(expected: string, actual: string): readonly DiffLine[] {
  const left = expected.split('\n');
  const right = actual.split('\n');
  const lengths = Array.from({ length: left.length + 1 }, () =>
    Array<number>(right.length + 1).fill(0),
  );
  for (let leftIndex = left.length - 1; leftIndex >= 0; leftIndex--) {
    for (let rightIndex = right.length - 1; rightIndex >= 0; rightIndex--) {
      lengths[leftIndex]![rightIndex] =
        left[leftIndex] === right[rightIndex]
          ? lengths[leftIndex + 1]![rightIndex + 1]! + 1
          : Math.max(
              lengths[leftIndex + 1]![rightIndex]!,
              lengths[leftIndex]![rightIndex + 1]!,
            );
    }
  }
  const lines: DiffLine[] = [];
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      lines.push({ kind: 'same', value: left[leftIndex]! });
      leftIndex++;
      rightIndex++;
    } else if (
      lengths[leftIndex + 1]![rightIndex]! >=
      lengths[leftIndex]![rightIndex + 1]!
    ) {
      lines.push({ kind: 'removed', value: left[leftIndex]! });
      leftIndex++;
    } else {
      lines.push({ kind: 'added', value: right[rightIndex]! });
      rightIndex++;
    }
  }
  while (leftIndex < left.length) {
    lines.push({ kind: 'removed', value: left[leftIndex++]! });
  }
  while (rightIndex < right.length) {
    lines.push({ kind: 'added', value: right[rightIndex++]! });
  }
  return lines;
}
