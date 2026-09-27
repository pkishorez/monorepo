import { WifiOffIcon } from '@kstackz/ui-toolkit/lucide';
import type { ReactNode } from 'react';
import { useOnline } from './online.js';

/**
 * Shown while offline. The live region is always rendered so screen readers
 * announce the change. It stacks above sheets and their backdrop (z-50).
 */
export const OfflineIndicator = (props: {
  readonly message?: string;
}): ReactNode => {
  const online = useOnline();
  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 top-[max(0.5rem,env(safe-area-inset-top))] z-60 flex justify-center"
    >
      {!online && (
        <span className="inline-flex animate-in items-center gap-2 rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background shadow-md duration-200 ease-out fade-in slide-in-from-top-1 motion-reduce:animate-none">
          <WifiOffIcon aria-hidden="true" className="size-3.5" />
          {props.message ?? "You're offline"}
        </span>
      )}
    </div>
  );
};
