import {
  Avatar,
  AvatarFallback,
} from '@monorepo/frontend/components/ui/avatar';
import { cn } from '@monorepo/frontend/lib/utils';
import { initials } from './money.ts';

const TONES = [
  'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300',
];

const toneOf = (name: string): string => {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.codePointAt(0)!) % 997;
  return TONES[hash % TONES.length]!;
};

export function Monogram({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <Avatar className={cn('size-9 rounded-full', className)}>
      <AvatarFallback
        className={cn(
          'rounded-full text-[0.7rem] font-medium tracking-wide',
          toneOf(name),
        )}
      >
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
