import {
  CheckIcon,
  ChevronRightIcon,
} from '@kestack/web-platform/ui/components/lucide';
import { cn } from '@kestack/web-platform/ui/components/utils';

/*
 * What the model chip's Drawer shows: a row each for the agent and the
 * model, which open the model Picker; then each setting, changed in place,
 * effort as a row of segments and any other as a short list, the one in
 * effect checked.
 */

/** One of the agent's settings, as the Drawer draws it. */
export interface Shown {
  readonly key: string;
  readonly label: string;
  readonly choices: ReadonlyArray<{
    readonly value: string;
    readonly label: string;
  }>;
  /** The choice in effect. */
  readonly value: string | null;
  /** A few steps of one scale, such as effort, side by side. */
  readonly segments: boolean;
}

const ROW =
  'flex min-h-12 w-full items-center gap-3 px-4 text-left text-base transition-colors duration-150 active:bg-muted motion-reduce:transition-none disabled:pointer-events-none disabled:opacity-50';

const HEADING = 'px-4 pt-4 pb-1.5 text-xs font-medium text-muted-foreground';

/** A row that opens the Picker at the agent or the model. */
export function OpenRow({
  label,
  value,
  onOpen,
}: {
  readonly label: string;
  readonly value: string;
  readonly onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${label}: ${value}`}
      className={ROW}
    >
      <span className="shrink-0 font-medium">{label}</span>
      <span className="ml-auto min-w-0 truncate text-muted-foreground">
        {value}
      </span>
      <ChevronRightIcon
        aria-hidden
        className="-mr-1 size-4 shrink-0 text-muted-foreground/70"
      />
    </button>
  );
}

/** One setting, changed in place: segments, or a short list. */
export function Setting({
  setting,
  onSet,
}: {
  readonly setting: Shown;
  readonly onSet: (value: string) => void;
}) {
  const id = `chip-setting-${setting.key}`;
  return (
    <div role="radiogroup" aria-labelledby={id}>
      <h3 id={id} className={HEADING}>
        {setting.label}
      </h3>
      {setting.segments ? (
        <div className="mx-4 flex gap-1 rounded-xl bg-muted p-1">
          {setting.choices.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={value === setting.value}
              onClick={() => onSet(value)}
              className={cn(
                'flex min-h-11 min-w-0 flex-1 items-center justify-center rounded-lg px-1 text-center text-sm leading-tight text-muted-foreground transition-[background-color,color,box-shadow] duration-150 ease-out text-balance motion-reduce:transition-none',
                'aria-checked:bg-background aria-checked:font-medium aria-checked:text-foreground aria-checked:shadow-sm dark:aria-checked:bg-card',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      ) : (
        setting.choices.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={value === setting.value}
            onClick={() => onSet(value)}
            className={cn(ROW, 'group')}
          >
            <span className="min-w-0 flex-1 truncate">{label}</span>
            <CheckIcon
              aria-hidden
              className="size-4 shrink-0 text-foreground opacity-0 group-aria-checked:opacity-100"
            />
          </button>
        ))
      )}
    </div>
  );
}
