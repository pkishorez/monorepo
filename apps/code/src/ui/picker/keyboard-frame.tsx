import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@kestack/web-platform/ui/components/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@kestack/web-platform/ui/components/popover';
import { cn } from '@kestack/web-platform/ui/components/utils';
import type { ReactElement, ReactNode } from 'react';
import type { Change } from './shape.ts';

/*
 * A Picker on a device with a keyboard: by its trigger in a popover when
 * opened by pointer, or a list centred on the page when opened by keys.
 * Base UI moves no focus as either closes: leaving the Surface puts it
 * back where it was.
 */

/** The trigger, and the popover it opens. */
export function ByTrigger({
  open,
  onOpenChange,
  label,
  trigger,
  side,
  align,
  className,
  children,
}: {
  readonly open: boolean;
  readonly onOpenChange: Change;
  readonly label: string;
  readonly trigger: ReactElement;
  readonly side: 'top' | 'bottom';
  readonly align: 'start' | 'center' | 'end';
  readonly className: string | undefined;
  readonly children: ReactNode;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger render={trigger} />
      <PopoverContent
        side={side}
        align={align}
        finalFocus={false}
        aria-label={label}
        className={cn('w-80 gap-0 overflow-hidden p-0', className)}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}

/**
 * The centred list. Not modal: the Surface keeps keys and focus in, so
 * leaving it can put focus back at once. Gone with its Picker, never left
 * closing: a closing dialog takes focus back to itself when the page under
 * it changes, as choosing a session does.
 */
export function Centred({
  open,
  onOpenChange,
  label,
  children,
}: {
  readonly open: boolean;
  readonly onOpenChange: Change;
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={false}>
      <DialogContent
        finalFocus={false}
        showCloseButton={false}
        className="top-1/3 translate-y-0 gap-0 overflow-hidden rounded-xl! p-0 sm:max-w-lg"
      >
        <DialogTitle className="sr-only">{label}</DialogTitle>
        {children}
      </DialogContent>
    </Dialog>
  );
}
