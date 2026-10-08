import { Check, X } from '@kstackz/web-platform/components/lucide';
import { cn } from '@kstackz/web-platform/components/utils';
import { JsonTree } from '@kstackz/web-platform/components/viewers/json';
import type {
  JsonValue,
  PhaseName,
  PhaseReport,
  Step,
} from 'laymos/story/schema';

import { formatDuration, phaseStatusStyles } from '../state-style';

export const phaseTitles: Readonly<Record<PhaseName, string>> = {
  prepare: 'Preparation',
  act: 'Action',
  verify: 'Verification',
};

export function PhaseSection({
  name,
  report,
  steps,
  onStepClick,
}: {
  readonly name: PhaseName;
  readonly report: PhaseReport | undefined;
  readonly steps: readonly Step[];
  readonly onStepClick?: (step: Step) => void;
}) {
  const style =
    report === undefined ? undefined : phaseStatusStyles[report.status];
  const empty =
    report !== undefined &&
    report.assertions.length === 0 &&
    report.value === undefined &&
    report.error === undefined &&
    steps.length === 0;

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <header className="flex items-center gap-3 border-b border-border px-4 py-2.5">
        <span
          className={cn(
            'size-2 rounded-full',
            style?.mark ?? 'bg-muted-foreground/30',
          )}
        />
        <h3 className="text-sm font-semibold">{phaseTitles[name]}</h3>
        {style !== undefined && (
          <span className={cn('text-xs font-medium', style.text)}>
            {style.label}
          </span>
        )}
        {report !== undefined && report.status !== 'skipped' && (
          <span className="ml-auto font-mono text-[11px] tabular-nums text-muted-foreground">
            {formatDuration(report.endedAt - report.startedAt)}
          </span>
        )}
      </header>
      <div className="flex flex-col gap-4 px-4 py-3.5 text-sm">
        {report === undefined && (
          <p className="text-muted-foreground">Not run yet.</p>
        )}
        {report?.status === 'skipped' && (
          <p className="text-muted-foreground">
            Skipped: an earlier phase did not complete.
          </p>
        )}
        {empty && report?.status !== 'skipped' && (
          <p className="text-muted-foreground">
            No assertions and no value returned.
          </p>
        )}
        {report !== undefined && report.assertions.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {report.assertions.map((assertion, index) => (
              <li key={index} className="flex items-start gap-2.5">
                <span
                  className={cn(
                    'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full',
                    assertion.passed
                      ? 'bg-positive/15 text-positive'
                      : 'bg-destructive/15 text-destructive',
                  )}
                >
                  {assertion.passed ? (
                    <Check className="size-2.5" strokeWidth={3} />
                  ) : (
                    <X className="size-2.5" strokeWidth={3} />
                  )}
                </span>
                <span className={cn(!assertion.passed && 'text-destructive')}>
                  {assertion.description}
                </span>
              </li>
            ))}
          </ul>
        )}
        {steps.length > 0 && (
          <div>
            <Label>Steps</Label>
            <ol className="-mx-2 flex flex-col">
              {steps.map((step, index) => (
                <li key={`${step.startedAt}-${index}`}>
                  <button
                    type="button"
                    onClick={() => onStepClick?.(step)}
                    className="grid w-full grid-cols-[4.5rem_1fr_auto] items-baseline gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted"
                  >
                    <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                      {(step.startedAt / 1000).toFixed(2)} s
                    </span>
                    <span className="min-w-0">
                      <span
                        className={cn(
                          'font-medium',
                          !step.passed && 'text-destructive',
                        )}
                      >
                        {step.name}
                      </span>
                      {step.error !== undefined && (
                        <span className="mt-0.5 block font-mono text-xs text-destructive">
                          {step.error}
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {step.kind} · {step.tab}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        )}
        {report?.value !== undefined && (
          <div>
            <Label>Returned value</Label>
            <EvidenceValue value={report.value} />
          </div>
        )}
        {report?.error !== undefined && <ErrorBlock message={report.error} />}
      </div>
    </section>
  );
}

export function ErrorBlock({ message }: { readonly message: string }) {
  return (
    <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg border border-destructive/30 bg-destructive/[0.06] px-3 py-2.5 font-mono text-xs leading-relaxed text-destructive">
      {message}
    </pre>
  );
}

function EvidenceValue({ value }: { readonly value: JsonValue }) {
  if (value !== null && typeof value === 'object') {
    return (
      <div className="rounded-lg bg-muted/50 px-3 py-2">
        <JsonTree value={value} collapsed={3} />
      </div>
    );
  }
  return (
    <code className="block rounded-lg bg-muted/50 px-3 py-2 font-mono text-[13px]">
      {JSON.stringify(value)}
    </code>
  );
}

function Label({ children }: { readonly children: string }) {
  return (
    <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </p>
  );
}
