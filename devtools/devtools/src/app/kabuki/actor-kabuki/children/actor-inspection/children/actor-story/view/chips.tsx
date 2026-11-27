import { XIcon } from 'lucide-react';

export function Chips({
  chips,
  onRemove,
}: {
  readonly chips: ReadonlyArray<string>;
  readonly onRemove?: (chip: string) => void;
}) {
  return (
    <ul className="flex flex-wrap gap-1">
      {chips.map((chip) => (
        <li
          key={chip}
          className="flex h-6 max-w-full min-w-0 items-center gap-0.5 rounded-md border border-border bg-background pr-0.5 pl-2 font-mono text-[11px] text-foreground/85"
        >
          <span className="min-w-0 truncate" title={chip}>
            {chip}
          </span>
          {onRemove ? (
            <button
              type="button"
              aria-label={`Remove ${chip}`}
              onClick={() => onRemove(chip)}
              className="flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors duration-150 outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
            >
              <XIcon aria-hidden className="size-3" />
            </button>
          ) : (
            <span className="w-1.5" />
          )}
        </li>
      ))}
    </ul>
  );
}
