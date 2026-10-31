import { GestureProvider, GestureZone } from '../../../ui/input/index.ts';
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
import { ResizeHandle } from './resize-handle.tsx';
import { useHydrated, useOpenState } from './state.ts';

interface FrameState {
  readonly open: boolean;
  readonly setOpen: (open: boolean) => void;
  readonly toggle: () => void;
  readonly isMobile: boolean;
  readonly hasSidebar: boolean;
  /** The Sidebar Mode: slid in beside the page, or a page of its own. */
  readonly sidebarMode: 'slide' | 'fullscreen';
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
  /** The Sidebar Mode, how the sidebar shows on a narrow screen. */
  readonly sidebarMode: 'slide' | 'fullscreen';
  /** The sidebar's width on a wide screen, in px. */
  readonly sidebarWidth?: number;
  /** Lets people resize the sidebar by its edge on a wide screen. */
  readonly onSidebarWidthChange?: (width: number) => void;
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
  // It fills the window it is drawn in, as a column.
  const root = cn('flex min-h-0 flex-1 flex-col', props.className);
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
      sidebarMode: 'slide',
    }),
    [isMobile],
  );
  return (
    <FrameContext.Provider value={state}>
      {props.statusBar?.(false)}
      <main
        data-slot="app-shell-page"
        className="flex min-h-0 flex-1 flex-col bg-background"
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

  // The two values everything is drawn from. The server can't know either,
  // so until hydration ends the classes give both by the breakpoint.
  const values = {
    '--sidebar-open': useOpenProgress({
      open,
      setOpen,
      swipe: props.swipe,
      fullscreen: props.sidebarMode === 'fullscreen',
    }),
    '--sidebar-mobile': useMobileProgress(),
  };
  const hydrated = useHydrated();
  const openState = shown ? 'open' : 'closed';
  // Set on each element drawn from them, as none of them is inherited.
  const drawnFrom = {
    '--sidebar-width':
      props.sidebarWidth === undefined ? '16rem' : `${props.sidebarWidth}px`,
    // A page of its own pushes the page off the whole screen.
    '--sidebar-width-mobile':
      props.sidebarMode === 'fullscreen' ? '100vw' : '18rem',
    ...DERIVED,
    ...(hydrated ? values : {}),
  };

  const state = useMemo<FrameState>(
    () => ({
      open: shown,
      setOpen,
      toggle,
      isMobile,
      hasSidebar: true,
      sidebarMode: props.sidebarMode,
    }),
    [shown, setOpen, toggle, isMobile, props.sidebarMode],
  );
  // On a phone the open sidebar covers the page, which is inert till it shuts.
  const covered = isMobile && shown;

  return (
    <FrameContext.Provider value={state}>
      <div
        data-slot="app-shell"
        data-sidebar={openState}
        className="relative flex min-h-0 w-full flex-1 overflow-hidden bg-sidebar"
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
        {/* Absolute, not fixed: a fixed element down the whole screen stops
            an installed iOS app's status bar following theme switches. */}
        <motion.aside
          inert={!shown}
          data-slot="app-shell-sidebar"
          data-sidebar={openState}
          style={{ ...drawnFrom, ...SIDEBAR_STYLE } as MotionStyle}
          className={cn(
            'absolute inset-y-0 left-0 z-0 flex w-(--sidebar-width-mobile) flex-col bg-sidebar pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] text-sidebar-foreground md:w-(--sidebar-width) md:py-2',
            FIRST_PAINT,
          )}
        >
          {/* On touch, use-gesture keeps the first 24px from the edge from
              the browser's back swipe, but not on a link or button. This
              strip covers the items there, so the swipe never reaches one. */}
          {props.swipe !== 'off' && (
            <div
              aria-hidden="true"
              className="absolute inset-y-0 left-0 z-10 hidden w-6 pointer-coarse:block"
            />
          )}
          {props.sidebar}
        </motion.aside>
        <motion.main
          inert={covered}
          data-slot="app-shell-page"
          data-sidebar={openState}
          style={{ ...drawnFrom, ...PAGE_STYLE } as MotionStyle}
          className={cn(
            'relative z-10 flex flex-col overflow-hidden bg-background shadow-sm',
            PAGE_SIZE,
            FIRST_PAINT,
          )}
        >
          {props.children}
          <motion.div
            aria-hidden="true"
            data-sidebar={openState}
            style={drawnFrom as MotionStyle}
            className={cn(
              'pointer-events-none absolute inset-0 z-50 bg-black',
              SCRIM,
              FIRST_PAINT,
            )}
          />
        </motion.main>
        {/* Over both, on the line between them, while the sidebar is beside the page. */}
        {props.onSidebarWidthChange !== undefined && shown && !isMobile && (
          <ResizeHandle
            width={props.sidebarWidth ?? 256}
            left={drawnFrom['--sidebar-width']}
            onWidthChange={props.onSidebarWidthChange}
          />
        )}
      </div>
    </FrameContext.Provider>
  );
}
