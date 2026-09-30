import { GestureProvider, GestureZone } from '@kstackz/use-gesture';
import { cn } from 'cn';
import { motion, type MotionStyle } from 'motion/react';
import {
  createContext,
  type CSSProperties,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
} from 'react';
import { useIsMobile } from '#hooks/use-mobile';
import {
  DERIVED,
  FIRST_PAINT,
  PAGE_SIZE,
  PAGE_STYLE,
  SCRIM,
  SIDEBAR_STYLE,
} from './geometry.ts';
import { useMobileProgress, useOpenProgress } from './motion.ts';
import { useHydrated, useOpenState, useToggleShortcut } from './state.ts';

interface FrameState {
  readonly open: boolean;
  readonly setOpen: (open: boolean) => void;
  readonly toggle: () => void;
  readonly isMobile: boolean;
  readonly hasSidebar: boolean;
}

const FrameContext = createContext<FrameState | null>(null);

/** The shell's state, for anything inside it. */
export function useFrame(): FrameState {
  const frame = useContext(FrameContext);
  if (frame === null)
    throw new Error('useAppShell must be used in an AppShell');
  return frame;
}

interface FrameProps {
  /** What the sidebar holds; without it the page fills the screen alone. */
  readonly sidebar?: ReactNode;
  /** The page. */
  readonly children: ReactNode;
  readonly swipe: 'anywhere' | 'edge' | 'off';
  /** The sidebar's width on a wide screen, in px. */
  readonly sidebarWidth?: number;
  /** Drawn outside the moving page, told whether the sidebar is open. */
  readonly statusBar?: (open: boolean) => ReactNode;
  readonly className?: string;
  readonly style?: CSSProperties;
}

/**
 * The screen: a sidebar under the page. On a phone the page moves aside,
 * shrinks and dims to show it, under a finger or a spring; on a wide screen
 * it sits beside the page, a card. Crossing between the two morphs.
 */
export function Frame(props: FrameProps) {
  const root = cn('h-dvh', props.className);
  if (props.sidebar === undefined) {
    return (
      <div className={root} style={props.style}>
        <Page statusBar={props.statusBar}>{props.children}</Page>
      </div>
    );
  }
  // A swipe needs a Gesture Zone; it takes only the swipes the sidebar wants.
  return (
    <GestureProvider>
      <GestureZone className={root} style={props.style}>
        <WithSidebar {...props} sidebar={props.sidebar} />
      </GestureZone>
    </GestureProvider>
  );
}

const noop = () => {};

function Page(props: {
  readonly statusBar: FrameProps['statusBar'];
  readonly children: ReactNode;
}) {
  const isMobile = useIsMobile();
  const state = useMemo<FrameState>(
    () => ({
      open: false,
      setOpen: noop,
      toggle: noop,
      isMobile,
      hasSidebar: false,
    }),
    [isMobile],
  );
  return (
    <FrameContext.Provider value={state}>
      {props.statusBar?.(false)}
      <main
        data-slot="app-shell-page"
        className="flex h-full flex-col bg-background"
      >
        {props.children}
      </main>
    </FrameContext.Provider>
  );
}

function WithSidebar(props: FrameProps & { readonly sidebar: ReactNode }) {
  const isMobile = useIsMobile();
  const { open, shown, setOpen } = useOpenState();
  const toggle = useCallback(() => setOpen(!open), [open, setOpen]);
  useToggleShortcut(toggle);

  // The two values everything is drawn from. The server can't know either,
  // so until hydration ends the classes give both by the breakpoint.
  const values = {
    '--sidebar-open': useOpenProgress({ open, setOpen, swipe: props.swipe }),
    '--sidebar-mobile': useMobileProgress(),
  };
  const hydrated = useHydrated();

  const state = useMemo<FrameState>(
    () => ({ open: shown, setOpen, toggle, isMobile, hasSidebar: true }),
    [shown, setOpen, toggle, isMobile],
  );
  // On a phone the open sidebar covers the page, which is inert till it shuts.
  const covered = isMobile && shown;

  return (
    <FrameContext.Provider value={state}>
      <div
        data-slot="app-shell"
        data-state={shown ? 'open' : 'closed'}
        className={cn(
          'relative flex size-full overflow-hidden bg-sidebar',
          FIRST_PAINT,
        )}
        style={
          {
            '--sidebar-width':
              props.sidebarWidth === undefined
                ? '16rem'
                : `${props.sidebarWidth}px`,
            '--sidebar-width-mobile': '18rem',
          } as CSSProperties
        }
        // The page is inert while covered, so a tap on it lands here: that
        // shuts the sidebar, as a tap on a scrim would.
        onClick={(event) => {
          if (covered && event.target === event.currentTarget) setOpen(false);
        }}
        onKeyDown={(event) => {
          if (covered && event.key === 'Escape') setOpen(false);
        }}
      >
        {props.statusBar?.(shown)}
        {/* No box of its own: it carries the values to what it holds. */}
        <motion.div
          className="contents"
          style={{ ...DERIVED, ...(hydrated ? values : {}) } as MotionStyle}
        >
          {/* Absolute, not fixed: a fixed element down the whole screen stops
              an installed iOS app's status bar following theme switches. */}
          <aside
            inert={!shown}
            data-slot="app-shell-sidebar"
            style={SIDEBAR_STYLE}
            className="absolute inset-y-0 left-0 z-0 flex w-(--sidebar-width-mobile) flex-col bg-sidebar pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] text-sidebar-foreground md:w-(--sidebar-width) md:py-2"
          >
            {props.sidebar}
          </aside>
          <main
            inert={covered}
            data-slot="app-shell-page"
            style={PAGE_STYLE}
            className={cn(
              'relative z-10 flex flex-col overflow-hidden bg-background shadow-sm',
              PAGE_SIZE,
            )}
          >
            {props.children}
            <div
              aria-hidden="true"
              className={cn(
                'pointer-events-none absolute inset-0 z-50 bg-black',
                SCRIM,
              )}
            />
          </main>
        </motion.div>
      </div>
    </FrameContext.Provider>
  );
}
