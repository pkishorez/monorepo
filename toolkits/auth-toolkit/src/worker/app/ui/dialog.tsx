import { AlertDialog } from '@base-ui/react/alert-dialog';
import type { ReactNode } from 'react';

/*
 * The one confirmation the pages ask: centred, focus held inside, Escape
 * and the backdrop cancel. Opens in 200ms, closes faster.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  /** The actions, cancel first. */
  children: ReactNode;
}) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 bg-scrim transition-opacity duration-200 ease-out data-[ending-style]:opacity-0 data-[ending-style]:duration-150 data-[starting-style]:opacity-0 motion-reduce:transition-none" />
        <AlertDialog.Popup className="fixed top-1/2 left-1/2 w-[min(400px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-popover p-6 shadow-(--shadow-overlay) outline-none transition-[opacity,scale] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] data-[ending-style]:scale-[0.97] data-[ending-style]:opacity-0 data-[ending-style]:duration-150 data-[starting-style]:scale-[0.97] data-[starting-style]:opacity-0 motion-reduce:transition-none">
          <AlertDialog.Title className="text-lg font-semibold text-balance">
            {title}
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-[15px] text-muted-foreground text-pretty">
            {description}
          </AlertDialog.Description>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {children}
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
