import { ArrowLeft } from 'lucide-react';
import { cn } from '@monorepo/frontend/lib/utils';

export interface StoreChoice {
  readonly value: string;
  readonly label: string;
  readonly reach: string;
}

const link =
  'rounded-sm outline-none transition-colors hover:text-foreground focus-visible:text-foreground';

export function StoreLine({
  stores,
  store,
  backHref,
  onChange,
}: {
  stores: readonly StoreChoice[];
  store: string;
  backHref: string;
  onChange: (value: string) => void;
}) {
  return (
    <header className="flex items-center gap-5">
      <a
        href={backHref}
        aria-label="Back to demos"
        className={cn(
          link,
          'flex size-6 items-center justify-center text-muted-foreground',
        )}
      >
        <ArrowLeft className="size-4" />
      </a>
      <nav
        aria-label="Store"
        className="flex flex-wrap gap-x-6 gap-y-2 py-1 text-sm"
      >
        {stores.map((choice) => (
          <button
            key={choice.value}
            type="button"
            aria-current={choice.value === store || undefined}
            onClick={() => onChange(choice.value)}
            className={cn(
              link,
              choice.value === store
                ? 'font-medium text-foreground'
                : 'text-muted-foreground',
            )}
          >
            {choice.label}
          </button>
        ))}
      </nav>
    </header>
  );
}
