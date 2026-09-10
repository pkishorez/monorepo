import type { ComponentType, ReactNode } from 'react';
import { JsonTree } from 'kui-toolkit/components/blocks/json';
import { Button } from 'kui-toolkit/components/ui/button';
import { RefreshCw } from 'kui-toolkit/lucide';

export function RefreshButton({
  query,
  label,
}: {
  query: { pending: boolean; refresh: () => void };
  label: string;
}) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      disabled={query.pending}
      onClick={query.refresh}
      aria-label={label}
      title={label}
    >
      <RefreshCw className={query.pending ? 'motion-safe:animate-spin' : ''} />
    </Button>
  );
}

export type ExplorerLocation = {
  stack?: string;
  stage?: string;
};

export type NavigationLink = ComponentType<
  ExplorerLocation & {
    home?: boolean;
    className?: string;
    title?: string;
    onClick?: () => void;
    children?: ReactNode;
  }
>;

export function Value({ title, value }: { title?: string; value: unknown }) {
  return (
    <section className="space-y-2">
      {title && (
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
      )}
      <div className="overflow-auto rounded-md border bg-muted/20 p-3 [--chart-1:var(--foreground)] [--chart-2:var(--foreground)] [--chart-3:var(--foreground)] [--chart-4:var(--foreground)] [--chart-5:var(--foreground)]">
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

const tones: Record<string, string> = {
  created: 'bg-emerald-500',
  updated: 'bg-emerald-500',
  ran: 'bg-emerald-500',
  creating: 'bg-amber-500',
  updating: 'bg-amber-500',
  replacing: 'bg-amber-500',
  running: 'bg-amber-500',
  deleting: 'bg-destructive',
  replaced: 'bg-muted-foreground/50',
};

export function Status({ status }: { status: string | null }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span
        aria-hidden="true"
        className={`size-1.5 rounded-full ${status ? (tones[status] ?? 'bg-muted-foreground/50') : 'bg-muted-foreground/30'}`}
      />
      <span className="capitalize">{status ?? 'Unreadable'}</span>
    </span>
  );
}

/** Splits `Parent/Child/Name` into a muted path and a strong leaf. */
export function ResourceName({ fqn }: { fqn: string }) {
  const index = fqn.lastIndexOf('/');
  const path = index === -1 ? '' : fqn.slice(0, index + 1);
  const leaf = index === -1 ? fqn : fqn.slice(index + 1);
  return (
    <span className="block min-w-0 truncate font-mono text-[13px]" title={fqn}>
      {path && <span className="text-muted-foreground">{path}</span>}
      <span className="font-medium">{leaf}</span>
    </span>
  );
}

export function PaneHeader({
  eyebrow,
  title,
  meta,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0 space-y-0.5">
        {eyebrow && (
          <p className="truncate text-xs text-muted-foreground">{eyebrow}</p>
        )}
        <h1 className="truncate text-lg font-semibold tracking-tight">
          {title}
        </h1>
        {meta && <p className="text-sm text-muted-foreground">{meta}</p>}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-1">{actions}</div>
      )}
    </header>
  );
}
