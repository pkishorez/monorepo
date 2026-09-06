import { QueryFeedback, Value } from './explorer-view.tsx';

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
      <QueryFeedback query={query} />
      {query.data && <Value value={query.data.data} />}
    </section>
  );
}
