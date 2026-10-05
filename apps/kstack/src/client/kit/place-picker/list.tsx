import { cn } from '@kstackz/ui-toolkit/utils';
import { motion, type Transition } from 'motion/react';
import type { Item } from './item.ts';

/**
 * Every item in order, the marked one under a highlight that springs from
 * row to row, and a dot beside where the travel began.
 */
export function List(props: {
  readonly items: ReadonlyArray<Item>;
  readonly marked: string;
  readonly start: string;
  readonly move: Transition;
}) {
  return (
    <ul className="grid min-w-44 p-1">
      {props.items.map((item) => {
        const marked = item.id === props.marked;
        return (
          <li
            key={item.id}
            aria-current={marked || undefined}
            className="relative flex items-center gap-2.5 px-2.5 py-1.5"
          >
            {marked && (
              <motion.span
                layoutId="place-picker-mark"
                transition={props.move}
                className="absolute inset-0 rounded-[10px] bg-accent"
              />
            )}
            <item.icon
              className={cn(
                'relative size-4',
                !marked && 'text-muted-foreground',
              )}
            />
            <span className={cn('relative flex-1', marked && 'font-medium')}>
              {item.label}
            </span>
            {item.id === props.start && (
              <span
                aria-label="Where you are"
                className="relative size-1.5 rounded-full bg-muted-foreground"
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
