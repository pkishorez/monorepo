import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CalendarIcon,
  MessageCircleIcon,
} from '@kstackz/ui-toolkit/lucide';
import { cn } from '@kstackz/ui-toolkit/utils';
import { type MotionValue, motion, useTransform } from 'motion/react';
import type { Task } from './data.ts';

/** How far a card travels before letting go moves it: also where its hint is fully shown. */
export const SWIPE_COMMIT = 96;

/** A task as a card: its title, tag, due date, comments and who has it. */
export function TaskCard(props: {
  readonly task: Task;
  readonly className?: string;
}) {
  const { task } = props;
  return (
    <div
      className={cn(
        'flex flex-col gap-2.5 rounded-lg bg-card p-3 shadow-xs ring-1 ring-edge',
        props.className,
      )}
    >
      <p className="text-sm leading-snug font-medium">{task.title}</p>
      <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
        <span
          className="rounded px-1.5 py-0.5 font-medium"
          style={{
            backgroundColor: `light-dark(oklch(0.95 0.04 ${task.tag.hue}), oklch(0.3 0.06 ${task.tag.hue}))`,
            color: `light-dark(oklch(0.45 0.13 ${task.tag.hue}), oklch(0.85 0.08 ${task.tag.hue}))`,
          }}
        >
          {task.tag.label}
        </span>
        {task.due === undefined ? null : (
          <span className="flex items-center gap-1">
            <CalendarIcon aria-hidden="true" className="size-3.5" />
            {task.due}
          </span>
        )}
        {task.comments === undefined ? null : (
          <span className="flex items-center gap-1 tabular-nums">
            <MessageCircleIcon aria-hidden="true" className="size-3.5" />
            {task.comments}
          </span>
        )}
        <span className="ml-auto grid size-6 place-items-center rounded-full bg-muted text-[10px] font-semibold text-foreground">
          {task.assignee}
        </span>
      </div>
    </div>
  );
}

/**
 * A task in its column. Swiped, it follows `x` over a hint of the column it
 * would go to; lifted, it leaves a dashed slot where it will land.
 */
export function CardItem(props: {
  readonly task: Task;
  readonly x: MotionValue<number> | undefined;
  readonly lifted: boolean;
  readonly fresh: boolean;
  readonly previous: string | undefined;
  readonly next: string | undefined;
}) {
  const { task, x } = props;
  return (
    <motion.li
      layout="position"
      transition={{ type: 'spring', visualDuration: 0.2, bounce: 0 }}
      initial={props.fresh ? { opacity: 0, scale: 0.96 } : false}
      animate={{ opacity: 1, scale: 1 }}
      data-card={task.id}
      className="relative"
    >
      {props.lifted ? (
        <div className="rounded-lg border-2 border-dashed border-border">
          <TaskCard task={task} className="invisible" />
        </div>
      ) : x === undefined ? (
        <TaskCard task={task} />
      ) : (
        <Swiping
          task={task}
          x={x}
          previous={props.previous}
          next={props.next}
        />
      )}
    </motion.li>
  );
}

function Swiping(props: {
  readonly task: Task;
  readonly x: MotionValue<number>;
  readonly previous: string | undefined;
  readonly next: string | undefined;
}) {
  const { x } = props;
  const toNext = useTransform(x, [0, SWIPE_COMMIT], [0, 1]);
  const toPrevious = useTransform(x, [-SWIPE_COMMIT, 0], [1, 0]);
  return (
    <>
      <div className="absolute inset-0 flex items-center justify-between rounded-lg bg-muted px-4 text-xs font-medium text-muted-foreground">
        <motion.span
          className="flex items-center gap-1.5"
          style={{ opacity: toNext }}
        >
          {props.next}
          {props.next === undefined ? null : (
            <ArrowRightIcon aria-hidden="true" className="size-3.5" />
          )}
        </motion.span>
        <motion.span
          className="flex items-center gap-1.5"
          style={{ opacity: toPrevious }}
        >
          {props.previous === undefined ? null : (
            <ArrowLeftIcon aria-hidden="true" className="size-3.5" />
          )}
          {props.previous}
        </motion.span>
      </div>
      <motion.div className="relative" style={{ x }}>
        <TaskCard task={props.task} />
      </motion.div>
    </>
  );
}
