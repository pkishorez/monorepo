import { useId } from 'react';
import { GitBranchIcon, Settings2Icon } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@kestack/web-platform/ui/components/popover';
import { Switch } from '@kestack/web-platform/ui/components/switch';
import { cn } from '@kestack/web-platform/ui/components/utils';
import type { Next } from '../logic/shared/index.ts';

const PILL =
  'flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none touch:h-11';

export function Ways({
  next,
  onPick,
}: {
  readonly next: ReadonlyArray<Next>;
  readonly onPick: (id: number) => void;
}) {
  if (next.length === 0) return null;
  return (
    <div
      role="group"
      aria-label="Where it goes on from this Step"
      className="flex min-w-0 items-center gap-1"
    >
      {next.map((one) => (
        <button
          key={one.id}
          type="button"
          aria-pressed={one.on}
          title={`#${one.id} ${one.label}`}
          onClick={() => onPick(one.id)}
          className={cn(
            PILL,
            'max-w-40',
            one.on
              ? 'border-foreground/20 bg-muted font-medium text-foreground'
              : 'border-border text-muted-foreground hover:text-foreground',
          )}
        >
          <span className="truncate">
            #{one.id} {one.label}
          </span>
        </button>
      ))}
    </div>
  );
}

export function Fork({ onFork }: { readonly onFork: () => void }) {
  return (
    <button
      type="button"
      title="Move the app's Head to this Step: its next Message starts a new Branch"
      onClick={onFork}
      className={cn(
        PILL,
        'border-border text-muted-foreground hover:text-foreground',
      )}
    >
      <GitBranchIcon aria-hidden className="size-3.5" />
      Fork here
    </button>
  );
}

function Toggle({
  label,
  hint,
  on,
  onChange,
}: {
  readonly label: string;
  readonly hint: string;
  readonly on: boolean;
  readonly onChange: (on: boolean) => void;
}) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className="-mx-2 flex cursor-pointer items-start justify-between gap-4 rounded-md px-2 py-1.5 transition-colors duration-150 hover:bg-muted/60 motion-reduce:transition-none"
    >
      <span className="flex flex-col gap-0.5">
        <span className="text-[13px] font-medium">{label}</span>
        <span className="text-xs text-pretty text-muted-foreground">
          {hint}
        </span>
      </span>
      <Switch id={id} checked={on} onCheckedChange={onChange} />
    </label>
  );
}

export function Settings({
  previewing,
  removed,
  compared,
  onPreview,
  onRemoved,
  onCompared,
}: {
  readonly previewing: boolean;
  readonly removed: boolean;
  readonly compared: boolean;
  readonly onPreview: (on: boolean) => void;
  readonly onRemoved: (on: boolean) => void;
  readonly onCompared: (on: boolean) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label="Inspector settings"
        className={cn(
          PILL,
          'w-7 justify-center px-0 touch:w-11',
          previewing || removed || compared
            ? 'border-foreground/20 text-foreground'
            : 'border-border text-muted-foreground hover:text-foreground',
        )}
      >
        <Settings2Icon aria-hidden className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-80 flex-col gap-1">
        <Toggle
          label="Preview in the app"
          hint="The app itself draws the Step you pick. It keeps its History; Sends wait until you turn this off."
          on={previewing}
          onChange={onPreview}
        />
        <Toggle
          label="Show what was removed"
          hint="Instances, Workers and fields a Step stopped or dropped, struck through in red."
          on={removed}
          onChange={onRemoved}
        />
        <Toggle
          label="Show what changed values were"
          hint="Every changed row shows its old value under the new one. Off, a row shows only the new value, and clicking it shows the old."
          on={compared}
          onChange={onCompared}
        />
      </PopoverContent>
    </Popover>
  );
}
