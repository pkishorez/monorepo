import { useState, type ComponentProps } from 'react';
import { ChevronDown, Maximize2, X } from 'lucide-react';
import type { StoryReport } from 'laymos';
import ReactMarkdown from 'react-markdown';

import { FlowItemDetails, FlowSwimlane } from '../../flow-swimlane/index';
import { attachCapturedLogs, TraceViewer } from '../../otel-trace-viewer/index';
import { SourceViewer } from '../../source-viewer/index';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '#components/ui/collapsible';
import { Dialog, DialogContent, DialogTitle } from '#components/ui/dialog';
import { scrollbarStyles } from '#lib/scrollStyles';
import { cn } from '#lib/utils';

export type QuestionReport = StoryReport['questions'][number];
type QuestionSection = QuestionReport['sections'][number];
type RecordedFlow = Extract<QuestionSection, { kind: 'flow' }>['flow'];

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
  const [open, setOpen] = useState(false);
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="overflow-hidden rounded-lg border border-border"
    >
      <CollapsibleTrigger className="group flex w-full items-center gap-2 bg-muted/30 px-3 py-1.5 text-left font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground">
        <span className="flex-1">result</span>
        <ChevronDown
          aria-hidden
          className={cn(
            'size-3.5 shrink-0 transition-transform',
            open && 'rotate-180',
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t border-border/60">
        <SourceViewer
          filePath="result.json"
          content={JSON.stringify(result, null, 2)}
          autoHeight
          showHeader={false}
          showLineNumbers={false}
        />
      </CollapsibleContent>
    </Collapsible>
  );
}

const artifactStyles = {
  trace: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  flow: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
} as const;

function FlowArtifactBody({ flow }: { readonly flow: RecordedFlow }) {
  const [selected, setSelected] = useState<
    RecordedFlow['items'][number] | null
  >(null);
  return (
    <div className="flex min-h-0 flex-1">
      <FlowSwimlane
        flow={flow}
        className="min-w-0 flex-1"
        selectedItemId={selected?.id ?? null}
        onSelectionChange={setSelected}
      />
      <div
        className={cn('w-96 shrink-0 overflow-y-auto', scrollbarStyles)}
        style={{ borderLeft: '1px solid var(--color-border)' }}
      >
        {selected ? (
          <FlowItemDetails item={selected} onClose={() => setSelected(null)} />
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-xs text-muted-foreground">
            Select a flow item to inspect its attributes
          </div>
        )}
      </div>
    </div>
  );
}

function ArtifactDialog({
  section,
  onClose,
}: {
  readonly section: QuestionSection;
  readonly onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[92vh] max-h-[92vh] w-[min(96vw,110rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[110rem]"
      >
        <div className="flex items-center gap-2.5 border-b border-border px-5 py-3">
          <span
            className={cn(
              'rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider',
              artifactStyles[section.kind],
            )}
          >
            {section.kind}
          </span>
          <DialogTitle className="min-w-0 flex-1 truncate text-sm font-semibold">
            {section.kind === 'flow' ? section.flow.id : 'Captured trace'}
          </DialogTitle>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        {section.kind === 'flow' ? (
          <FlowArtifactBody flow={section.flow as RecordedFlow} />
        ) : (
          <div
            className={cn('min-h-0 flex-1 overflow-y-auto', scrollbarStyles)}
          >
            <TraceViewer
              spans={attachCapturedLogs(
                section.trace.spans,
                section.trace.logs,
              )}
            />
            {section.trace.truncated && (
              <div className="px-3.5 py-1.5 text-xs text-muted-foreground">
                trace truncated
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ArtifactCard({ section }: { readonly section: QuestionSection }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen(true)}
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
        <Maximize2 className="size-3.5 shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <ArtifactDialog section={section} onClose={() => setOpen(false)} />
      )}
    </section>
  );
}
