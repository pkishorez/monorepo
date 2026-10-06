import { ChevronRight } from '@kstackz/ui-toolkit/lucide';
import { cn } from '@kstackz/ui-toolkit/utils';
import { motion, type Transition } from 'motion/react';
import { type Choice, opens } from './tree.ts';

/**
 * Every choice of one list in order, the marked one under a highlight that
 * springs from row to row, a dot beside where the swipe began, and a
 * chevron on each choice with choices inside it, nudged toward them when
 * marked.
 */
export function List(props: {
  readonly id: string;
  readonly choices: ReadonlyArray<Choice>;
  readonly marked: number;
  readonly here: number | undefined;
  readonly move: Transition;
}) {
  return (
    <ul className="grid min-w-44 p-1">
      {props.choices.map((choice, index) => {
        const marked = index === props.marked;
        return (
          <li
            key={choice.id}
            aria-current={marked || undefined}
            className="relative flex items-center gap-2.5 px-2.5 py-1.5"
          >
            {marked && (
              <motion.span
                layoutId={`thumb-picker-mark-${props.id}`}
                transition={props.move}
                className="absolute inset-0 rounded-[10px] bg-accent"
              />
            )}
            {choice.icon && (
              <choice.icon
                className={cn(
                  'relative size-4',
                  !marked && 'text-muted-foreground',
                )}
              />
            )}
            <span
              className={cn(
                'relative flex-1 truncate',
                marked && 'font-medium',
              )}
            >
              {choice.label}
            </span>
            {index === props.here && (
              <span
                aria-label="Where you are"
                className="relative size-1.5 rounded-full bg-muted-foreground"
              />
            )}
            {opens(choice) && (
              <ChevronRight
                aria-label="Has more inside"
                className={cn(
                  'relative -mr-1 size-3.5 text-muted-foreground transition-transform duration-150',
                  marked && 'translate-x-0.5 text-foreground',
                )}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
