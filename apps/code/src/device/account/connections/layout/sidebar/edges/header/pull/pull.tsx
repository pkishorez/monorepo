import { Loader2Icon, RefreshCwIcon } from 'lucide-react';
import { motion, useTransform } from 'motion/react';
import {
  GestureZone,
  useDevice,
  usePullToRefresh,
} from '@kestack/web-platform/ui/input';
import {
  createContext,
  type ReactNode,
  type RefObject,
  use,
  useEffect,
  useRef,
} from 'react';

/*
 * Pull to Reload: on a touch screen, pulling the sidebar down from its top
 * reloads the Connection List, as Reload beside the Connection Filter does. A
 * small arrow comes down over the list with the pull, turning as it goes;
 * let go past the mark and it spins until the list is asked again, then
 * springs back up; under reduced motion it jumps, and holds still while it
 * waits. The list itself stays still, and what floats over it, such as the
 * Project Picker's plus, with it. The sidebar's View says how to Reload
 * through `useReload`.
 * With no touch screen the sidebar is drawn as it is.
 */

/** How long the spinner shows at least, so a quick Reload is still seen. */
const AT_LEAST = 700;

const Reload = createContext<RefObject<(() => void) | null> | null>(null);

/** Hands Pull to Reload what Reload does, while the caller is drawn. */
export const useReload = (reload: () => void) => {
  const at = use(Reload);
  useEffect(() => {
    if (at === null) return;
    at.current = reload;
    return () => void (at.current = null);
  });
};

/** The sidebar's scrolling list, pulled down from its top to Reload. */
export function PullToReload({ children }: { readonly children: ReactNode }) {
  const reload = useRef<(() => void) | null>(null);
  const { touch } = useDevice();
  return (
    <Reload value={reload}>
      {touch ? (
        <GestureZone className="relative flex min-h-0 flex-1 flex-col">
          <Pulled reload={reload}>{children}</Pulled>
        </GestureZone>
      ) : (
        children
      )}
    </Reload>
  );
}

function Pulled({
  reload,
  children,
}: {
  readonly reload: RefObject<(() => void) | null>;
  readonly children: ReactNode;
}) {
  const pull = usePullToRefresh({
    distance: 64,
    onRefresh: () => {
      reload.current?.();
      return new Promise((done) => setTimeout(done, AT_LEAST));
    },
  });
  // Down from above the list to under its title, turning with the pull.
  const top = useTransform(pull.y, (y) => y * 1.4 - 32);
  const turn = useTransform(pull.progress, [0, 1], [-120, 180]);
  const shown = useTransform(pull.progress, [0, 0.4, 1], [0, 0.6, 1]);
  const refreshing = pull.state === 'refreshing';
  return (
    <>
      <motion.div
        role={refreshing ? 'status' : undefined}
        aria-label={refreshing ? 'Reloading the Connections' : undefined}
        style={{ y: top, opacity: shown }}
        className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center"
      >
        <span
          className={`grid size-8 place-items-center rounded-full border border-border bg-popover shadow-sm transition-colors duration-150 motion-reduce:transition-none ${pull.state === 'armed' || refreshing ? 'text-foreground' : 'text-muted-foreground'}`}
        >
          {refreshing ? (
            <Loader2Icon
              aria-hidden
              className="size-4 animate-spin motion-reduce:animate-none"
            />
          ) : (
            <motion.span style={{ rotate: turn }} className="grid">
              <RefreshCwIcon aria-hidden className="size-4" />
            </motion.span>
          )}
        </span>
      </motion.div>
      {children}
    </>
  );
}
