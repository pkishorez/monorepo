import { cn } from '@kstackz/ui-toolkit/utils';

const TINTS = [
  'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  'bg-teal-500/15 text-teal-700 dark:text-teal-300',
];

/** A sender's initials on a tint of their own, the same every time. */
export function Avatar(props: {
  readonly name: string;
  readonly className?: string;
}) {
  const initials = props.name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
  const hash = [...props.name].reduce((sum, c) => sum + c.charCodeAt(0), 0);
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold',
        TINTS[hash % TINTS.length],
        props.className,
      )}
    >
      {initials}
    </span>
  );
}
