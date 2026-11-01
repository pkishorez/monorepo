import { Button } from '@kestack/web-platform/ui/components/button';
import { cn } from '@kestack/web-platform/ui/components/utils';
import { XIcon } from 'lucide-react';
import { useBound } from '../../../../../commands.ts';

/*
 * By the way: a question about the open Session, asked without
 * interrupting it, from the Draft in Btw mode, and read in the Btw Drawer
 * (`drawer.tsx`). Both wear the btw mark, in By the way's own blue, so
 * what is asked on the side never reads as the session's.
 */

/** The btw mark: the three letters, set as a small tag. */
export function BtwMark({ className }: { readonly className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex h-4 shrink-0 items-center rounded-[0.3rem] bg-btw px-1 text-[10px] leading-none font-semibold tracking-[0.04em] text-btw-foreground lowercase',
        className,
      )}
    >
      btw
    </span>
  );
}

/** What the toggle's keys are, out of Vim Mode and in it. */
export const useToggleKeys = () => {
  const anywhere = useBound('content.btwAnywhere');
  const vim = useBound('content.btw');
  return anywhere ?? vim;
};

/**
 * The Btw toggle, first on the Draft's Status Line, or its chip's row on
 * touch: off, the mark alone, quiet; on, the mark and "By the way" in
 * its blue, with a cross that goes back to the Message. It keeps focus
 * where it was, so typing goes on in the Draft it switched to.
 */
export function BtwToggle({
  on,
  onToggle,
}: {
  readonly on: boolean;
  readonly onToggle: () => void;
}) {
  const keys = useToggleKeys();
  const title = on
    ? 'Back to the message'
    : 'By the way: ask about this session without interrupting it';
  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      aria-pressed={on}
      aria-label={on ? 'Back to the message' : 'By the way'}
      title={keys === null ? title : `${title} (${keys})`}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onToggle}
      data-on={on || undefined}
      className="group/btw shrink-0 gap-1.5 rounded-full px-1.5 text-muted-foreground pointer-coarse:h-10 pointer-coarse:px-2.5 data-on:bg-btw/12 data-on:pr-1 data-on:text-btw data-on:hover:bg-btw/18 data-on:hover:text-btw"
    >
      <BtwMark
        className={
          on
            ? undefined
            : 'bg-transparent text-current ring-1 ring-current/60 ring-inset'
        }
      />
      {on && (
        <>
          <span className="font-medium">By the way</span>
          <XIcon aria-hidden className="size-3.5 opacity-70" />
        </>
      )}
    </Button>
  );
}
