import { QueryError, ListSkeleton } from '../query-feedback/index.ts';
import { Value } from './explorer-view.tsx';

export function Outputs({
  query,
}: {
  query: {
    data: { data: unknown } | null;
    pending: boolean;
    error: string | null;
    refresh: () => void;
  };
}) {
  return (
    <div className="space-y-3">
      {query.error && (
        <QueryError
          message={query.error}
          stale={query.data !== null}
          pending={query.pending}
          onRetry={query.refresh}
        />
      )}
      {query.pending && !query.data && <ListSkeleton label="Loading outputs" />}
      {query.data && query.data.data === null && (
        <p className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
          This stage has no outputs.
        </p>
      )}
      {query.data && query.data.data !== null && (
        <Value value={query.data.data} />
      )}
    </div>
  );
}
