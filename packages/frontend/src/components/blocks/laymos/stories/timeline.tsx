import { useState } from 'react';
import type { RecordedFlow } from '@pkishorez/effect-tracer/flow';
import { ChevronDown } from 'lucide-react';
import type { StoryReport } from 'laymos';
import ReactMarkdown from 'react-markdown';

import { FlowSwimlane } from '../../flow-swimlane/index';
import { attachCapturedLogs, TraceViewer } from '../../otel-trace-viewer/index';
import { cn } from '#lib/utils';

type StorySection = StoryReport['sections'][number];

export type Verdict = StoryReport['verdict'];

const statusIconStyles = {
  passed: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  failed: 'bg-red-500/15 text-red-600 dark:text-red-400',
  errored: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
} as const;

const statusMarks = { passed: '✓', failed: '✕', errored: '!' } as const;

export function StatusIcon({
  verdict,
  className,
}: {
  readonly verdict: Verdict | undefined;
  readonly className?: string;
}) {
  return (
    <span
      className={cn(
        'flex size-4.5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold leading-none',
        verdict === undefined
          ? 'border border-muted-foreground/30 text-transparent'
          : statusIconStyles[verdict],
        className,
      )}
    >
      {verdict === undefined ? '·' : statusMarks[verdict]}
    </span>
  );
}

export function VerdictDot({
  verdict,
  className,
}: {
  readonly verdict: Verdict | undefined;
  readonly className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-block size-2 shrink-0 rounded-full',
        verdict === undefined
          ? 'bg-muted-foreground/25'
          : verdict === 'passed'
            ? 'bg-emerald-500'
            : verdict === 'failed'
              ? 'bg-red-500'
              : 'bg-amber-500',
        className,
      )}
    />
  );
}

export function Markdown({
  children,
  className,
}: {
  readonly children: string;
  readonly className?: string;
}) {
  return (
    <div
      className={cn(
        'prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed',
        className,
      )}
    >
      <ReactMarkdown>{children}</ReactMarkdown>
    </div>
  );
}

export function StoryReportBody({ report }: { readonly report: StoryReport }) {
  return (
    <div className="flex flex-col gap-3">
      {report.sections.map((section, index) => (
        <SectionCard key={index} section={section} />
      ))}
      {report.error !== undefined && (
        <pre className="overflow-x-auto rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-xs leading-relaxed text-red-600 dark:text-red-400">
          {report.error}
        </pre>
      )}
    </div>
  );
}

const sectionKindStyles = {
  trace: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  flow: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  exec: 'bg-muted text-muted-foreground',
} as const;

function SectionCard({ section }: { readonly section: StorySection }) {
  const [open, setOpen] = useState(false);
  const expandable = section.kind !== 'exec';
  const passed = section.assertions.filter(
    (assertion) => assertion.passed,
  ).length;
  const total = section.assertions.length;
  const header = (
    <>
      <span
        className={cn(
          'rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider',
          sectionKindStyles[section.kind],
        )}
      >
        {section.kind}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium leading-snug">
        {section.description}
      </span>
      {total > 0 && (
        <span
          className={cn(
            'text-xs tabular-nums',
            passed === total
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-red-600 dark:text-red-400',
          )}
        >
          {passed}/{total}
        </span>
      )}
      {expandable && (
        <ChevronDown
          className={cn(
            'size-4 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-180',
          )}
        />
      )}
    </>
  );
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      {expandable ? (
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex w-full items-center gap-2.5 bg-muted/30 px-3.5 py-2.5 text-left transition-colors hover:bg-muted/60"
        >
          {header}
        </button>
      ) : (
        <header className="flex items-center gap-2.5 bg-muted/30 px-3.5 py-2.5">
          {header}
        </header>
      )}
      {total > 0 && (
        <ul className="flex flex-col gap-1.5 border-t border-border/60 px-3.5 py-2.5">
          {section.assertions.map((assertion, index) => (
            <li key={index} className="flex items-start gap-2 text-sm">
              <StatusIcon
                verdict={assertion.passed ? 'passed' : 'failed'}
                className="mt-0.5"
              />
              <span className="leading-snug">{assertion.description}</span>
            </li>
          ))}
        </ul>
      )}
      {open && section.kind === 'flow' && (
        <div className="border-t border-border/60">
          <FlowSwimlane flow={section.flow as RecordedFlow} />
        </div>
      )}
      {open && section.kind === 'trace' && (
        <div className="border-t border-border/60">
          <TraceViewer
            spans={attachCapturedLogs(section.trace.spans, section.trace.logs)}
          />
          {section.trace.truncated && (
            <div className="px-3.5 py-1.5 text-xs text-muted-foreground">
              trace truncated
            </div>
          )}
        </div>
      )}
    </section>
  );
}
