import type { ReactNode } from 'react';
import { Button } from '@kstackz/web-platform/components/button';
import { trapTab } from '../focus/index.js';
import type { Options } from './options.js';
import { idsOf } from './options.js';

/*
 * How a dialog is drawn: its trigger, and while open, the backdrop and the
 * panel. Drawn in place, not in the top layer: `showModal` would make the
 * whole page inert, the Shell's timeline included, every time Time Travel
 * drew a dialog open. The panel keeps Tab inside itself instead, and
 * Escape stops at the innermost open dialog.
 */
export const DialogFrame = ({
  options,
  open,
  onOpen,
  onDismiss,
  onChoose,
  children,
}: {
  readonly options: Options;
  readonly open: boolean;
  readonly onOpen: () => void;
  readonly onDismiss: () => void;
  readonly onChoose: (value: string) => void;
  readonly children?: ReactNode;
}) => {
  const ids = idsOf(options);
  return (
    <>
      <Button
        id={ids.trigger}
        variant={options.triggerVariant ?? 'outline'}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={onOpen}
      >
        {options.trigger}
      </Button>
      {open && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onDismiss();
          }}
        >
          <div
            id={ids.panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={ids.title}
            className="w-full max-w-md rounded-lg border bg-background p-6 shadow-lg"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation();
                onDismiss();
              } else trapTab(event);
            }}
          >
            <h2 id={ids.title} className="text-lg font-semibold">
              {options.title}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {options.description}
            </p>
            {children && <div className="mt-4">{children}</div>}
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={onDismiss}>
                Close
              </Button>
              {options.actions.map((action) => (
                <Button
                  key={action.value}
                  variant={action.variant ?? 'default'}
                  onClick={() => onChoose(action.value)}
                >
                  {action.label}
                </Button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
