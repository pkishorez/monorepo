import type { ArchitectureAnalysis } from 'laymos';

import { cn } from '@kstackz/web-platform/components/utils';

export interface Findings {
  readonly violations: readonly {
    readonly path: string;
    readonly file: string;
  }[];
  readonly unowned: readonly { readonly path: string; readonly file: string }[];
  readonly unusedRules: readonly {
    readonly path: string;
    readonly label: string;
  }[];
  readonly unusedExceptions: readonly {
    readonly path: string;
    readonly label: string;
  }[];
}

/** What the strip counts, each with the path of the first card involved. */
export function findingsOf(analysis: ArchitectureAnalysis): Findings {
  return {
    violations: analysis.imports
      .filter(({ verdict }) => verdict.kind === 'violation')
      .map(({ fromModule, fromFile }) => ({
        path: fromModule,
        file: fromFile,
      })),
    unowned: analysis.findings.flatMap((finding) =>
      finding.kind === 'wrapper-coverage'
        ? [
            {
              path: analysis.tree.owners[finding.file] ?? finding.file,
              file: finding.file,
            },
          ]
        : [],
    ),
    unusedRules: analysis.findings.flatMap((finding) =>
      finding.kind === 'unused-rule'
        ? [
            {
              path: finding.rule.from,
              label: `${finding.rule.from} → ${finding.rule.to}`,
            },
          ]
        : [],
    ),
    unusedExceptions: analysis.findings.flatMap((finding) =>
      finding.kind === 'unused-exception'
        ? [
            {
              path: finding.exception.from,
              label: `${finding.exception.from} → ${finding.exception.to}`,
            },
          ]
        : [],
    ),
  };
}

/**
 * The counts at the bottom of the space: Violations, files no Module owns,
 * unused Rules and Exceptions. Each count takes the reader to the first
 * card involved.
 */
export function FindingsStrip({
  findings,
  onReveal,
}: {
  readonly findings: Findings;
  readonly onReveal: (path: string) => void;
}) {
  const counts = [
    {
      count: findings.violations.length,
      one: 'Violation',
      many: 'Violations',
      short: 'violations',
      alarm: true,
      first: findings.violations[0]?.path,
      title: findings.violations.map(({ file }) => file).join('\n'),
    },
    {
      count: findings.unowned.length,
      one: 'file no Module owns',
      many: 'files no Module owns',
      short: 'unowned',
      alarm: true,
      first: findings.unowned[0]?.path,
      title: findings.unowned.map(({ file }) => file).join('\n'),
    },
    {
      count: findings.unusedRules.length,
      one: 'unused Rule',
      many: 'unused Rules',
      short: 'unused Rules',
      alarm: false,
      first: findings.unusedRules[0]?.path,
      title: findings.unusedRules.map(({ label }) => label).join('\n'),
    },
    {
      count: findings.unusedExceptions.length,
      one: 'unused Exception',
      many: 'unused Exceptions',
      short: 'unused Exceptions',
      alarm: false,
      first: findings.unusedExceptions[0]?.path,
      title: findings.unusedExceptions.map(({ label }) => label).join('\n'),
    },
  ];
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
