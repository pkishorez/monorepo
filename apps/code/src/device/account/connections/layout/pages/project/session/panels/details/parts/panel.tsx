import { XIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@kestack/web-platform/ui/components/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@kestack/web-platform/ui/components/dialog';
import { cn } from '@kestack/web-platform/ui/components/utils';
import { Drawer } from '@kestack/web-platform/recipes/touch-layers';
import { useDevice } from '@kestack/web-platform/ui/input';

/*
 * A Panel: something to read and act on over the page, its title on top.
 * With a keyboard or a mouse it is a dialog in the middle of the screen,
 * closed by Escape, a click outside or its close button; on a touch screen
 * with no keyboard it is a Drawer rising from the bottom, closed by a swipe
 * down or a tap outside, as the Touch Layers' own. What it holds scrolls
 * inside it, its title staying put.
 */

export function Panel({
  open,
  onOpenChange,
  label,
  title,
  description,
  wide = false,
  tall = false,
  children,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** What it is called to a screen reader, where its title is not words alone. */
  readonly label?: string;
  readonly title: ReactNode;
  /** A line under the title, such as what it is about. */
  readonly description?: ReactNode;
  /** As wide as a table needs, on a wide screen. */
  readonly wide?: boolean;
  /** As a Drawer, most of the screen whatever it holds. */
  readonly tall?: boolean;
  readonly children: ReactNode;
}) {
  const { touch, keyboard } = useDevice();
  if (touch && !keyboard)
    return (
      <Drawer
        open={open}
        onOpenChange={(next) => onOpenChange(next)}
        label={label ?? (typeof title === 'string' ? title : 'Details')}
        tall={tall}
      >
        <div className="flex shrink-0 flex-col gap-0.5 px-5 pt-1 pb-3">
          <h2 className="truncate text-base font-semibold">{title}</h2>
          {description !== undefined && (
            <div className="text-sm text-muted-foreground">{description}</div>
          )}
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain px-5 pb-4">
          {children}
        </div>
      </Drawer>
    );
  return (
    <Dialog open={open} onOpenChange={(next) => onOpenChange(next)}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          'flex max-h-[min(85dvh,52rem)] flex-col gap-0 overflow-hidden p-0',
          wide ? 'sm:max-w-2xl' : 'sm:max-w-md',
        )}
      >
        <header className="flex shrink-0 items-start gap-3 px-5 pt-5 pb-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <DialogTitle className="truncate text-base leading-6 font-semibold">
              {title}
            </DialogTitle>
            {description !== undefined && (
              <DialogDescription
                render={<div />}
                className="text-sm text-muted-foreground"
              >
                {description}
              </DialogDescription>
            )}
          </div>
          <DialogClose
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Close"
                className="-mt-1 -mr-2 shrink-0 text-muted-foreground"
              />
            }
          >
            <XIcon aria-hidden />
          </DialogClose>
        </header>
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain px-5 pb-5">
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}
