import { JsonTree } from 'kui-toolkit/components/blocks/json';

export function Value({ title, value }: { title?: string; value: unknown }) {
  return (
    <section className="space-y-3">
      {title && <h3 className="text-sm font-medium">{title}</h3>}
      <div className="overflow-auto rounded-md border bg-muted/20 p-4 [--chart-1:var(--foreground)] [--chart-2:var(--foreground)] [--chart-3:var(--foreground)] [--chart-4:var(--foreground)] [--chart-5:var(--foreground)]">
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
