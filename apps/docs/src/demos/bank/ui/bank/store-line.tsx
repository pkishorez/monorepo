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
  onChange,
}: {
  stores: readonly StoreChoice[];
  store: string;
  onChange: (value: string) => void;
}) {
  return (
    <header>
      <nav aria-label="Store" className="flex flex-wrap gap-x-4 text-sm">
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
