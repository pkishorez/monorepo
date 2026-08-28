import { useMemo, useState } from 'react';
import { ChevronDown, Maximize2, X } from '@monorepo/frontend/lucide';
import type { StoryReport } from 'laymos';

import {
  FlowItemDetails,
  FlowSwimlane,
  getFlowSummaryIds,
} from '@monorepo/frontend/components/blocks/flow-swimlane';
import { MarkdownViewer } from '@monorepo/frontend/components/blocks/markdown-viewer';
import {
  attachCapturedLogs,
  TraceViewer,
} from '@monorepo/frontend/components/blocks/otel-trace-viewer';
import { SourceViewer } from '@monorepo/frontend/components/blocks/source-viewer';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@monorepo/frontend/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@monorepo/frontend/components/ui/dialog';
import { scrollbarStyles } from '@monorepo/frontend/lib/scrollStyles';
import { cn } from '@monorepo/frontend/lib/utils';

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

export { MarkdownViewer as Markdown };

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

function FlowArtifactBody({
  flow,
  onClose,
}: {
  readonly flow: RecordedFlow;
  readonly onClose: () => void;
}) {
  const [selected, setSelected] = useState<
    RecordedFlow['items'][number] | null
  >(null);
  const summaryIds = useMemo(() => getFlowSummaryIds(flow), [flow]);
  const [collapsedSummaryIds, setCollapsedSummaryIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const allSummariesCollapsed =
    summaryIds.size > 0 &&
    [...summaryIds].every((summaryId) => collapsedSummaryIds.has(summaryId));
  return (
    <div className="flex min-h-0 flex-1">
      <FlowSwimlane
        flow={flow}
        className="min-w-0 flex-1"
        collapsedSummaryIds={collapsedSummaryIds}
        onCollapsedSummaryIdsChange={setCollapsedSummaryIds}
        selectedItemId={selected?.id ?? null}
        onSelectionChange={setSelected}
      />
      <div
        className="flex w-96 shrink-0 flex-col"
        style={{ borderLeft: '1px solid var(--color-border)' }}
      >
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-2">
          <button
            type="button"
            disabled={summaryIds.size === 0}
            onClick={() =>
              setCollapsedSummaryIds(
                allSummariesCollapsed ? new Set() : summaryIds,
              )
            }
            className="rounded-md border border-border px-2 py-1 text-[11px] font-medium transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {allSummariesCollapsed ? 'Expand all' : 'Collapse all'}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="ml-auto shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>
        <div className={cn('min-h-0 flex-1 overflow-y-auto', scrollbarStyles)}>
          {selected ? (
            <FlowItemDetails item={selected} />
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center text-xs text-muted-foreground">
              Select a flow item to inspect its attributes
            </div>
          )}
        </div>
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
        showCloseButton={section.kind === 'trace'}
        className="flex h-[92vh] max-h-[92vh] w-[min(96vw,110rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[110rem]"
      >
        <DialogTitle className="sr-only">
          {section.kind === 'flow' ? section.flow.id : 'Captured trace'}
        </DialogTitle>
        {section.kind === 'flow' ? (
          <FlowArtifactBody
            flow={section.flow as RecordedFlow}
            onClose={onClose}
          />
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
