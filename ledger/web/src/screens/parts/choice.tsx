import { cn } from '@kstackz/web-toolkit/components/utils';
import type { ReactNode } from 'react';

/**
 * One of a few things, as a row of pills that scrolls sideways when it
 * does not fit: Categories, Accounts, days. The chosen one is the only
 * one filled.
 */
export function Choice<T extends string>(props: {
  readonly label: string;
  readonly value: T;
  readonly options: ReadonlyArray<{
    readonly value: T;
    readonly label: string;
    readonly icon?: ReactNode;
  }>;
  readonly onChange: (value: T) => void;
  readonly className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={props.label}
      className={cn(
        'no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4',
        props.className,
      )}
    >
      {props.options.map((option) => {
        const on = option.value === props.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => props.onChange(option.value)}
            className={cn(
              'focus-ring flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm whitespace-nowrap transition-colors duration-100 [&_svg]:size-3.5',
              on
                ? 'border-primary bg-primary text-primary-foreground [&_svg]:text-primary-foreground'
                : 'border-border text-foreground hover:bg-accent',
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
