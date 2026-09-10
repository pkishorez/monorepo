import type { ComponentType, ReactNode } from 'react';
import { Button } from 'kui-toolkit/components/ui/button';

export function QueryError({
  message,
  stale,
  pending,
  onRetry,
}: {
  message: string;
  stale?: boolean;
  pending?: boolean;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm"
    >
      <div className="min-w-0 space-y-1">
        <p className="break-words">{message}</p>
        {stale && (
          <p className="text-muted-foreground">Showing previous results.</p>
        )}
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={onRetry}
        disabled={pending}
        className="shrink-0"
      >
        Retry
      </Button>
    </div>
  );
}

export function ListSkeleton({
  label,
  rowHeight = 'h-16',
}: {
  label: string;
  rowHeight?: 'h-16' | 'h-20';
}) {
  return (
    <div
      role="status"
      aria-label={label}
      className="divide-y overflow-hidden rounded-lg border"
    >
      {[0, 1, 2].map((row) => (
        <div key={row} className={`flex ${rowHeight} items-center gap-3 px-4`}>
          <span className="size-4 rounded-sm bg-muted motion-safe:animate-pulse" />
          <span className="h-4 w-36 rounded-sm bg-muted motion-safe:animate-pulse" />
          <span className="ml-auto h-3 w-20 rounded-sm bg-muted motion-safe:animate-pulse" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="px-6 py-20 text-center">
      <Icon className="mx-auto mb-4 size-6 text-muted-foreground" />
      <h2 className="text-sm font-medium">{title}</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground text-pretty">
        {description}
      </p>
      {action && <div className="mt-6">{action}</div>}
    </section>
  );
}
