import { Button } from '@monorepo/frontend/components/ui/button';

export interface StoreOption {
  readonly value: string;
  readonly label: string;
}

export function StoreToggle({
  stores,
  store,
  onChange,
}: {
  stores: readonly StoreOption[];
  store: string;
  onChange: (value: string) => void;
}) {
  const index = stores.findIndex((option) => option.value === store);
  const current = stores[index] ?? stores[0];
  if (current === undefined) return null;
  const next = stores[(index + 1) % stores.length] ?? current;

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => onChange(next.value)}
      title={`Storing in ${current.label} — switch to ${next.label}`}
      aria-label={`Storage: ${current.label}. Switch to ${next.label}.`}
      className="h-8 w-32 shrink-0 justify-center gap-2 px-2.5 font-normal tabular-nums"
    >
      <span className="flex shrink-0 items-center gap-0.5" aria-hidden>
        {stores.map((option) => (
          <span
            key={option.value}
            className={
              option.value === current.value
                ? 'h-1 w-3 rounded-full bg-foreground transition-colors'
                : 'h-1 w-1 rounded-full bg-muted-foreground/40 transition-colors'
            }
          />
        ))}
      </span>
      <span className="truncate text-xs">{current.label}</span>
    </Button>
  );
}
