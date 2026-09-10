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
    <section
      role="tabpanel"
      id="outputs-panel"
      aria-labelledby="outputs-tab"
      className="space-y-4"
    >
      {query.error && (
        <QueryError
          message={query.error}
          stale={query.data !== null}
          pending={query.pending}
          onRetry={query.refresh}
        />
      )}
      {query.pending && !query.data && <ListSkeleton label="Loading outputs" />}
      {query.data && <Value value={query.data.data} />}
    </section>
  );
}
