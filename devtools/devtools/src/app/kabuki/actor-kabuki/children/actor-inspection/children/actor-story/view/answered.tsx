import { useEffect, useRef } from 'react';
import { cn } from '@kestack/web-platform/ui/components/utils';
import { Say } from '../../../view/shared/index.js';
import type { At, Turn } from '../logic/shared/index.js';

const shortOf = (path: string) => path.split('/').at(-1) ?? path;

const SCROLL = '(prefers-reduced-motion: reduce)';

export function Answered({
  turn,
  index,
  at,
  missing,
  onJump,
}: {
  readonly turn: Turn;
  readonly index: number;
  readonly at: At | null;
  readonly missing: (turn: number, beat: number) => boolean;
  readonly onJump: (turn: number, beat: number) => void;
}) {
  const current = useRef<HTMLLIElement>(null);
  useEffect(() => {
    current.current?.scrollIntoView({
      block: 'nearest',
      behavior: window.matchMedia(SCROLL).matches ? 'auto' : 'smooth',
    });
  }, [at?.turn, at?.beat]);
  if (turn.answer === null)
    return turn.text === null ? null : <Say>{turn.text}</Say>;
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="text-sm font-medium text-foreground">
        {turn.answer.title}
      </h3>
      <ol className="-mx-1.5 flex flex-col">
        {turn.answer.beats.map((beat, number) => {
          const here = at?.turn === index && at.beat === number;
          const lost = missing(index, number);
          return (
            <li key={number} ref={here ? current : undefined}>
              <button
                type="button"
                aria-current={here ? 'step' : undefined}
                onClick={() => onJump(index, number)}
                className={cn(
                  'group flex w-full cursor-pointer gap-2.5 rounded-md px-1.5 py-1.5 text-left transition-colors duration-150 outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
                  here && 'bg-muted hover:bg-muted',
                )}
              >
                <span
                  className={cn(
                    'mt-px flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px] text-muted-foreground tabular-nums transition-colors duration-150 motion-reduce:transition-none',
                    here
                      ? 'border-running bg-running text-background'
                      : 'border-border',
                  )}
                >
                  {number + 1}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex min-w-0 items-baseline gap-1.5 font-mono text-[11px] text-muted-foreground">
                    <span className="truncate" title={beat.focus}>
                      {shortOf(beat.focus)}
                    </span>
                    {lost && (
                      <span className="ml-auto shrink-0 font-sans text-removed">
                        not found
                      </span>
                    )}
                  </span>
                  <Say>{beat.say}</Say>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
