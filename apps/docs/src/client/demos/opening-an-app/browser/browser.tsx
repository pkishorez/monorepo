import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { Lock, RotateCw } from 'lucide-react';

export type Device = 'desktop' | 'mobile';

const EASE = [0.32, 0.72, 0, 1] as const;

/**
 * A browser window the app runs in, as wide as a desktop or a phone. The app
 * lays itself out by the window's width, not the screen's. On a phone, the
 * window is the whole screen.
 */
export function Browser({
  device,
  address,
  onReload,
  children,
}: {
  readonly device: Device;
  readonly address: string;
  /** Load the page again: start the app over. */
  readonly onReload: () => void;
  readonly children: ReactNode;
}) {
  const mobile = device === 'mobile';
  return (
    <motion.div
      initial={false}
      animate={{ maxWidth: mobile ? 390 : 1080, maxHeight: mobile ? 780 : 820 }}
      transition={{ duration: 0.45, ease: EASE }}
      className="flex h-full w-full flex-col overflow-hidden bg-background max-sm:max-w-none! sm:rounded-2xl sm:border sm:border-border sm:shadow-[0_1px_2px_rgb(0_0_0/0.04),0_12px_40px_-12px_rgb(0_0_0/0.18)]"
    >
      <div className="flex h-11 shrink-0 items-center gap-3 border-b border-border bg-muted/40 px-3">
        {!mobile && (
          <div className="flex gap-1.5 max-sm:hidden" aria-hidden>
            <span className="size-2.5 rounded-full bg-foreground/15" />
            <span className="size-2.5 rounded-full bg-foreground/15" />
            <span className="size-2.5 rounded-full bg-foreground/15" />
          </div>
        )}
        <div className="mx-auto flex h-7 w-full max-w-sm min-w-0 items-center gap-2 rounded-lg bg-background px-2.5 text-xs text-muted-foreground">
          <Lock className="size-3 shrink-0" />
          <span className="truncate">{address}</span>
          <button
            type="button"
            onClick={onReload}
            aria-label="Reload: start the app over"
            title="Reload: start the app over"
            className="ml-auto grid size-5 shrink-0 place-items-center rounded transition-colors duration-150 outline-offset-1 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            <RotateCw className="size-3" />
          </button>
        </div>
        {!mobile && <div className="w-[42px] max-sm:hidden" aria-hidden />}
      </div>
      <div className="@container relative min-h-0 flex-1">{children}</div>
    </motion.div>
  );
}
