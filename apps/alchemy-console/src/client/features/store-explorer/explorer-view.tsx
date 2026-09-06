import { Button } from 'kui-toolkit/components/ui/button';
import { Layers } from 'kui-toolkit/lucide';
import { JsonTree } from 'kui-toolkit/components/blocks/json';
export function QueryFeedback({
  query,
}: {
  query: {
    pending: boolean;
    data: unknown;
    error: string | null;
    refresh: () => void;
  };
}) {
  return (
    <>
      {query.error && (
        <div
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm"
        >
          <p>{query.error}</p>
          {query.data !== null && (
            <p className="mt-1 text-muted-foreground">
              Showing previous results.
            </p>
          )}
          <Button
            variant="outline"
            className="mt-3"
            onClick={query.refresh}
            disabled={query.pending}
          >
            Retry
          </Button>
        </div>
      )}
      {query.pending && !query.data && (
        <div
          role="status"
          aria-label="Loading"
          className="divide-y overflow-hidden rounded-lg border"
        >
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex h-16 items-center gap-3 px-4">
              <span className="size-4 animate-pulse rounded bg-muted" />
              <span className="h-4 w-36 animate-pulse rounded bg-muted" />
              <span className="ml-auto h-3 w-20 animate-pulse rounded bg-muted" />
            </div>
          ))}
          <span className="sr-only">Loading…</span>
        </div>
      )}
    </>
  );
}
export function Empty({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-dashed px-6 py-16 text-center">
      <Layers className="mx-auto mb-4 size-8 text-muted-foreground" />
      <h3 className="font-medium">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
export function Value({ title, value }: { title?: string; value: unknown }) {
  return (
    <section className="space-y-3">
      {title && <h3 className="text-sm font-medium">{title}</h3>}
      <div className="overflow-auto rounded-lg border bg-muted/20 p-4 [--chart-1:var(--foreground)] [--chart-2:var(--foreground)] [--chart-3:var(--foreground)] [--chart-4:var(--foreground)] [--chart-5:var(--foreground)]">
        {value !== null && typeof value === 'object' ? (
          <JsonTree value={value} collapsed={2} />
        ) : (
          <pre className="whitespace-pre-wrap break-all text-xs">
            {value === undefined
              ? 'Not available'
              : JSON.stringify(value, null, 2)}
          </pre>
        )}
      </div>
    </section>
  );
}
