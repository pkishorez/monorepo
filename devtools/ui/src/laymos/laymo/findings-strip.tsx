import type { ArchitectureAnalysis } from 'laymos';

import { cn } from '@kstackz/web-platform/components/utils';

/**
 * One count the strip shows: how many of a finding there are, its name in
 * the singular, the plural and a phone's few letters, whether it is an
 * alarm, the path of the first card involved, and the title listing them.
 */
export interface FindingCount {
  readonly count: number;
  readonly one: string;
  readonly many: string;
  readonly short: string;
  readonly alarm: boolean;
  readonly first: string | undefined;
  readonly title: string;
}

/** What the strip counts for a Project, each with the path of the first card involved. */
export function findingsOf(
  analysis: ArchitectureAnalysis,
): readonly FindingCount[] {
  const violations = analysis.imports.filter(
    ({ verdict }) => verdict.kind === 'violation',
  );
  const unowned = analysis.findings.flatMap((finding) =>
    finding.kind === 'wrapper-coverage'
      ? [
          {
            path: analysis.tree.owners[finding.file] ?? finding.file,
            file: finding.file,
          },
        ]
      : [],
  );
  const unusedRules = analysis.findings.flatMap((finding) =>
    finding.kind === 'unused-rule' ? [finding.rule] : [],
  );
  const unusedExceptions = analysis.findings.flatMap((finding) =>
    finding.kind === 'unused-exception' ? [finding.exception] : [],
  );
  const label = ({ from, to }: { from: string; to: string }) =>
    `${from} → ${to}`;
  return [
    {
      count: violations.length,
      one: 'Violation',
      many: 'Violations',
      short: 'violations',
      alarm: true,
      first: violations[0]?.fromModule,
      title: violations.map(({ fromFile }) => fromFile).join('\n'),
    },
    {
      count: unowned.length,
      one: 'file no Module owns',
      many: 'files no Module owns',
      short: 'unowned',
      alarm: true,
      first: unowned[0]?.path,
      title: unowned.map(({ file }) => file).join('\n'),
    },
    {
      count: unusedRules.length,
      one: 'unused Rule',
      many: 'unused Rules',
      short: 'unused Rules',
      alarm: false,
      first: unusedRules[0]?.from,
      title: unusedRules.map(label).join('\n'),
    },
    {
      count: unusedExceptions.length,
      one: 'unused Exception',
      many: 'unused Exceptions',
      short: 'unused Exceptions',
      alarm: false,
      first: unusedExceptions[0]?.from,
      title: unusedExceptions.map(label).join('\n'),
    },
  ];
}

/**
 * The counts at the bottom of the space: for a Project, Violations, files
 * no Module owns, unused Rules and Exceptions. Each count takes the reader
 * to the first card involved.
 */
export function FindingsStrip({
  counts,
  onReveal,
}: {
  readonly counts: readonly FindingCount[];
  readonly onReveal: (path: string) => void;
}) {
  // On a phone only the counts that say something show, briefly.
  const anything = counts.some(({ count }) => count > 0);
  return (
    <div
      role="status"
      aria-label="Findings"
      className={cn(
        'pointer-events-auto flex h-8 min-w-0 max-w-full items-center gap-1 overflow-x-auto rounded-lg bg-background/90 px-1.5 shadow-xs ring-1 ring-border backdrop-blur-sm',
        !anything && 'max-sm:hidden',
      )}
    >
      {counts.map(({ count, one, many, short, alarm, first, title }) => (
        <button
          key={one}
          type="button"
          disabled={first === undefined}
          title={title === '' ? undefined : title}
          onClick={() => {
            if (first !== undefined) onReveal(first);
          }}
          className={cn(
            'flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2 text-[11px] transition-colors',
            count === 0 && 'max-sm:hidden',
            count === 0
              ? 'text-muted-foreground/70'
              : alarm
                ? 'text-destructive hover:bg-destructive/10'
                : 'text-foreground hover:bg-muted',
          )}
        >
          <span className="font-semibold tabular-nums">{count}</span>
          <span className="max-sm:hidden">{count === 1 ? one : many}</span>
          <span className="sm:hidden">{short}</span>
        </button>
      ))}
    </div>
  );
}
