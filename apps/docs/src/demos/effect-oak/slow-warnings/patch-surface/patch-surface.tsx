import { memo } from 'react';

/** Thousands of keyed rows, redrawn only when a new run asks for them. */
const Rows = memo(
  ({ count, run }: { readonly count: number; readonly run: number }) => (
    <div className="grid max-h-80 gap-1 overflow-auto pr-2">
      {Array.from({ length: count }, (_, index) => (
        <div
          key={`${run}-${index}`}
          className="flex items-center justify-between rounded-md border px-3 py-1.5 text-xs text-muted-foreground"
        >
          <span>Patch row {index + 1}</span>
          <span className="font-mono">run {run}</span>
        </div>
      ))}
    </div>
  ),
);

export const PatchSurface = ({
  rows,
  run,
}: {
  readonly rows: number;
  readonly run: number;
}) => (
  <section className="flex flex-col gap-4 rounded-lg border p-4">
    <div>
      <h2 className="font-semibold">Patch surface</h2>
      <p className="text-sm text-muted-foreground">
        {rows.toLocaleString()} keyed rows mounted
      </p>
    </div>
    {rows === 0 ? (
      <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
        Patch rows will appear here.
      </p>
    ) : (
      <Rows count={rows} run={run} />
    )}
  </section>
);
