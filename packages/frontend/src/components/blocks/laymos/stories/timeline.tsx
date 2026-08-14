import { useState, type ComponentProps } from 'react';
import type { RecordedFlow } from '@pkishorez/effect-tracer/flow';
import { ChevronDown } from 'lucide-react';
import type { StoryReport } from 'laymos';
import ReactMarkdown from 'react-markdown';

import { FlowSwimlane } from '../../flow-swimlane/index';
import { attachCapturedLogs, TraceViewer } from '../../otel-trace-viewer/index';
import { SourceViewer } from '../../source-viewer/index';
import { cn } from '#lib/utils';

export type QuestionReport = StoryReport['questions'][number];
type QuestionSection = QuestionReport['sections'][number];

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
    <div className={cn('prose dark:prose-invert max-w-none', className)}>
      <ReactMarkdown
        components={{
          pre: ({ children }) => <>{children}</>,
          code: MarkdownCode,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

function MarkdownCode({ className, children }: ComponentProps<'code'>) {
  const language = /language-(\w+)/.exec(className ?? '')?.[1];
  if (language === undefined) {
    return <code className={className}>{children}</code>;
  }
  return (
    <div className="not-prose my-3">
      <SourceViewer
        filePath={`snippet.${language}`}
        content={String(children).replace(/\n$/, '')}
        autoHeight
        showHeader={false}
        showLineNumbers={false}
        className="rounded-lg border border-border"
      />
    </div>
  );
}

export function CodeSnippet({
  code,
  className,
}: {
  readonly code: string;
  readonly className?: string;
}) {
  return (
    <SourceViewer
      filePath="snippet.ts"
      content={code}
      autoHeight
      showHeader={false}
      showLineNumbers={false}
      className={cn('rounded-lg border border-border', className)}
    />
  );
}

export function QuestionProof({ report }: { readonly report: QuestionReport }) {
  return (
    <div className="flex flex-col gap-2.5">
      {report.error !== undefined ? (
        <pre className="overflow-x-auto rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-xs leading-relaxed text-red-600 dark:text-red-400">
          {report.error}
        </pre>
      ) : (
        <ResultBlock result={report.result ?? null} />
      )}
      {report.assertions.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {report.assertions.map((assertion, index) => (
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
      {report.sections.map((section, index) => (
        <ArtifactCard key={index} section={section} />
      ))}
    </div>
  );
}

function ResultBlock({
  result,
}: {
  readonly result: NonNullable<QuestionReport['result']> | null;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="border-b border-border/60 bg-muted/30 px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        result
      </div>
      <SourceViewer
        filePath="result.json"
        content={JSON.stringify(result, null, 2)}
        autoHeight
        showHeader={false}
        showLineNumbers={false}
      />
    </div>
  );
}

const artifactStyles = {
  trace: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  flow: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
} as const;

function ArtifactCard({ section }: { readonly section: QuestionSection }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2.5 bg-muted/30 px-3.5 py-2 text-left transition-colors hover:bg-muted/60"
      >
        <span
          className={cn(
            'rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider',
            artifactStyles[section.kind],
          )}
        >
          {section.kind}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {section.kind === 'trace'
            ? `${section.trace.spans.length} span${section.trace.spans.length === 1 ? '' : 's'}`
            : `${section.flow.items.length} item${section.flow.items.length === 1 ? '' : 's'}`}
        </span>
        <ChevronDown
          className={cn(
            'size-4 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>
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
