import { Button } from '@kstackz/web-platform/components/button';

type Warning = {
  readonly id: number;
  readonly phase: string;
  readonly durationMs: number;
  readonly thresholdMs: number;
  readonly trigger: string;
  readonly details: string;
};

/** The warnings recorded so far, newest first. */
export const Warnings = ({
  warnings,
  accentOf,
  onClear,
}: {
  readonly warnings: ReadonlyArray<Warning>;
  readonly accentOf: (phase: Warning['phase']) => string;
  readonly onClear: () => void;
}) => (
  <section className="flex flex-col gap-4 rounded-lg border p-4">
    <div className="flex items-center justify-between gap-3">
      <div>
        <h2 className="font-semibold">Recorded warnings</h2>
        <p className="text-sm text-muted-foreground">
          Timed by the View, since the Runtime has no slow callback.
        </p>
      </div>
      <Button size="sm" variant="outline" onClick={onClear}>
        Clear
      </Button>
    </div>
    {warnings.length === 0 ? (
      <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
        Run a workload to record a warning.
      </p>
    ) : (
      <ul className="grid gap-2">
        {warnings.map((warning) => (
          <li
            key={warning.id}
            className={`rounded-lg border p-3 ${accentOf(warning.phase)}`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-semibold">
                {warning.phase} exceeded {warning.thresholdMs}ms
              </h3>
              <p className="text-sm font-semibold tabular-nums">
                {warning.durationMs.toFixed(1)}ms
              </p>
            </div>
            <p className="mt-1 text-sm">
              {warning.details} Trigger: {warning.trigger}.
            </p>
          </li>
        ))}
      </ul>
    )}
  </section>
);
