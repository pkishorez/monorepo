import { Fragment, useCallback, useMemo, type ReactNode } from 'react';
import type { ProofLeaf, ProofReport, StoryNode } from 'laymos/story/schema';

import { ChevronRight, Play, X } from '@kstackz/web-platform/components/lucide';
import { Button } from '@kstackz/web-platform/components/button';
import { scrollbarStyles } from '@kstackz/web-platform/components/scroll-styles';
import { cn } from '@kstackz/web-platform/components/utils';
import { SourceViewer } from '@kstackz/web-platform/components/viewers/source-viewer';

import {
  attachCapturedLogs,
  TraceViewer,
} from '../../../otel-trace-viewer/trace-viewer';
import { CriticalBadge, StateLabel, VenueLabel } from '../badges';
import {
  RecordingsPlayer,
  useRecordingsPlayback,
} from '../recordings-player/recordings-player';
import { formatDuration } from '../state-style';
import type { ProofState } from '../story-scope';
import { ErrorBlock, PhaseSection } from './phase-section';

const phaseOrder = ['prepare', 'act', 'verify'] as const;
const noSteps: ProofReport['steps'] = [];
const noRecordings: ProofReport['recordings'] = [];
const startedAtFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

/**
 * One Proof with its whole Proof report: the Recordings first and largest,
 * then each phase, the trace, and the Proof file.
 */
export function ProofPanel({
  proof,
  path,
  report,
  state,
  onRun,
  onClose,
  onStory,
  evidenceUrl,
}: {
  readonly proof: ProofLeaf;
  /** The Stories from the top down to the one the Proof sits in. */
  readonly path: readonly StoryNode[];
  readonly report: ProofReport | undefined;
  readonly state: ProofState;
  readonly onRun: () => void;
  readonly onClose: () => void;
  readonly onStory: (id: string) => void;
  readonly evidenceUrl: (proofId: string, file: string) => string;
}) {
  // While it waits or runs again, its last report is no verdict any more.
  const rerunning = state === 'pending' || state === 'running';
  const steps = report?.steps ?? noSteps;
  const recordings = report?.recordings ?? noRecordings;
  const playback = useRecordingsPlayback(recordings, steps);
  const frameUrl = useCallback(
    (file: string) => evidenceUrl(proof.id, file),
    [evidenceUrl, proof.id],
  );
  const traceSpans = useMemo(
    () =>
      report?.trace == null
        ? []
        : attachCapturedLogs(report.trace.spans, report.trace.logs),
    [report?.trace],
  );

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <header className="flex shrink-0 items-start gap-4 border-b border-border px-6 pb-4 pt-4 max-sm:px-5">
        <div className="min-w-0 flex-1">
          <nav
            aria-label="Stories"
            className="flex min-w-0 items-center gap-0.5 text-xs text-muted-foreground"
          >
            {path.map((story, position) => (
              <Fragment key={story.id}>
                {position > 0 && (
                  <ChevronRight
                    className="size-3 shrink-0 opacity-60"
                    aria-hidden
                  />
                )}
                <button
                  type="button"
                  onClick={() => onStory(story.id)}
                  className="truncate rounded px-1 py-0.5 transition-colors hover:bg-muted hover:text-foreground"
                >
                  {story.title}
                </button>
              </Fragment>
            ))}
          </nav>
          <h2 className="mt-1 text-xl font-semibold leading-tight text-balance">
            {proof.title}
          </h2>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
            <StateLabel state={state} />
            <VenueLabel venue={proof.venue} />
            {proof.critical && <CriticalBadge />}
            {report !== undefined && !rerunning && (
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {formatDuration(report.duration)} ·{' '}
                {startedAtFormat.format(report.startedAt)}
              </span>
            )}
            <span className="font-mono text-[11px] text-muted-foreground/80">
              {proof.id}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button size="sm" onClick={onRun} disabled={rerunning}>
            <Play className="size-3.5" />
            {state === 'running'
              ? 'Running'
              : state === 'pending'
                ? 'Waiting'
                : 'Run'}
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={onClose}
            aria-label="Close (Esc)"
            title="Close (Esc)"
          >
            <X />
          </Button>
        </div>
      </header>
      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col gap-8 overflow-y-auto px-6 py-5 max-sm:px-5',
          scrollbarStyles,
        )}
      >
        {rerunning && report !== undefined && (
          <p className="shrink-0 rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
            Re-running… the report below is from the last run.
          </p>
        )}
        {proof.description !== null && (
          <p className="max-w-prose shrink-0 text-sm leading-relaxed text-muted-foreground">
            {proof.description}
          </p>
        )}
        {report?.error !== undefined && (
          <div className={cn('shrink-0', rerunning && 'opacity-50')}>
            <ErrorBlock message={report.error} />
          </div>
        )}
        {report === undefined && (
          <p className="shrink-0 rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            Not run yet. Run it to see what it proves.
          </p>
        )}
        {recordings.length > 0 && report !== undefined && (
          <RecordingsPlayer
            recordings={recordings}
            steps={steps}
            phases={report.phases}
            playback={playback}
            frameUrl={frameUrl}
            className={cn(
              'h-[max(400px,78%)] shrink-0',
              rerunning && 'opacity-50',
            )}
          />
        )}
        {report !== undefined && (
          <Section title="Phases" dimmed={rerunning}>
            <div className="flex flex-col gap-3">
              {phaseOrder.map((phase) => (
                <PhaseSection
                  key={phase}
                  name={phase}
                  report={report.phases.find((entry) => entry.phase === phase)}
                  steps={steps.filter((step) => step.phase === phase)}
                  onStepClick={(step) => playback.seek(step.startedAt)}
                />
              ))}
            </div>
          </Section>
        )}
        {report?.trace != null && (
          <Section
            title="Trace"
            dimmed={rerunning}
            aside={report.trace.truncated ? 'truncated' : undefined}
          >
            <TraceViewer spans={traceSpans} className="h-[400px]" />
          </Section>
        )}
        <Section title="Proof file" aside={proof.source.path}>
          <div className="overflow-hidden rounded-xl border border-border">
            <SourceViewer
              filePath={proof.source.path}
              content={proof.source.content}
              autoHeight
            />
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({
  title,
  aside,
  dimmed = false,
  children,
}: {
  readonly title: string;
  readonly aside?: string | undefined;
  readonly dimmed?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <section
      className={cn('shrink-0 transition-opacity', dimmed && 'opacity-50')}
    >
      <h3 className="mb-3 flex items-baseline gap-2 text-sm font-semibold">
        {title}
        {aside !== undefined && (
          <span className="font-mono text-xs font-normal text-muted-foreground">
            {aside}
          </span>
        )}
      </h3>
      {children}
    </section>
  );
}
