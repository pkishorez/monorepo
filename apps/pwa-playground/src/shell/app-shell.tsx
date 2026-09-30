import { Link } from '@tanstack/react-router';
import {
  GestureProvider,
  GestureZone,
  type PullState,
  usePullToRefresh,
  useSidebar,
} from '@kstackz/use-gesture';
import { Button } from '@kstackz/ui-toolkit/components/ui/button';
import {
  ArrowDownIcon,
  LoaderCircleIcon,
  MenuIcon,
  TriangleAlertIcon,
  XIcon,
} from '@kstackz/ui-toolkit/lucide';
import {
  motion,
  useMotionValueEvent,
  useTransform,
} from '@kstackz/ui-toolkit/motion';
import { cn } from '@kstackz/ui-toolkit/utils';
import { useOnline } from '@kstackz/pwa-toolkit/extras';
import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from 'react';
import { appTheme, ThemeToggle } from '../components/index.ts';
import { simulateLoad } from '../lib/simulated-load.ts';
import { PageTurnProvider, TurnSurface } from '../page-turn/index.ts';
import { useTouch, useWide } from './media.ts';
import { ChapterNav } from './nav.tsx';
import { RefreshProvider, useRefreshAll } from './refresh.tsx';

/** The menu's width, and the strip along the left edge that opens it. */
const DRAWER = 288;
const EDGE = 24;

// The app zone is a reading surface: text stays selectable and long-press
// keeps the system menu. Demo stages are zones of their own with the defaults.
const READABLE: CSSProperties = {
  userSelect: 'text',
  WebkitUserSelect: 'text',
  WebkitTouchCallout: 'default',
};

/** The app icon (public/favicon.svg), inline so it paints offline too. */
function Mark() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 32 32"
      width="24"
      height="24"
      className="size-6 shrink-0 rounded-md"
    >
      <rect width="32" height="32" fill="#18181b" />
      <circle cx="16" cy="16" r="13" fill="#8b5cf6" />
      <circle cx="16" cy="16" r="5" fill="#fafafa" />
    </svg>
  );
}

function OnlineDot() {
  const online = useOnline();
  return (
    <span
      data-testid="online"
      className="flex h-7 items-center gap-1.5 rounded-full px-2.5 font-mono text-xs text-muted-foreground ring-1 ring-foreground/10"
    >
      <span
        aria-hidden="true"
        className={cn(
          'size-1.5 rounded-full',
          online ? 'bg-positive' : 'bg-destructive',
        )}
      />
      {online ? 'online' : 'offline'}
    </span>
  );
}

function Header(props: {
  readonly menuButton: RefObject<HTMLButtonElement | null>;
  readonly menuOpen: boolean;
  readonly onMenu: () => void;
}) {
  return (
    <header className="z-30 shrink-0 border-b border-border bg-background pt-[env(safe-area-inset-top)] pr-[max(0.5rem,env(safe-area-inset-right))] pl-[max(0.5rem,env(safe-area-inset-left))] lg:px-4">
      <div className="flex h-14 items-center gap-1">
        <Button
          ref={props.menuButton}
          variant="ghost"
          size="icon"
          className="size-11 lg:hidden"
          aria-label="Open the menu"
          aria-expanded={props.menuOpen}
          aria-controls="menu"
          data-testid="nav-menu"
          onClick={props.onMenu}
        >
          <MenuIcon aria-hidden="true" />
        </Button>
        <Link
          to="/"
          data-testid="nav-home"
          className="flex min-h-11 items-center gap-2.5 rounded-md px-1.5 text-[15px] font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <Mark />
          PWA Playground
        </Link>
        <div className="ml-auto flex items-center gap-1">
          <OnlineDot />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

const PULL_LABEL: Record<PullState, string> = {
  idle: 'Pull to refresh',
  pulling: 'Pull to refresh',
  armed: 'Release to refresh',
  refreshing: 'Refreshing…',
};

/** The pill that comes down with a pull, over the top of the page. */
function PullIndicator(props: {
  readonly pull: ReturnType<typeof usePullToRefresh>;
}) {
  const { pull } = props;
  const y = useTransform(pull.y, (v) => v - 44);
  const opacity = useTransform(pull.progress, [0, 0.4], [0, 1]);
  const rotate = useTransform(pull.progress, [0, 1], [0, 180]);
  return (
    <motion.div
      aria-hidden={pull.state === 'idle'}
      style={{ y, opacity }}
      className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center"
    >
      <div
        role="status"
        className={cn(
          'flex h-9 items-center gap-2 rounded-full bg-card px-3.5 text-sm shadow-md ring-1 ring-foreground/10 transition-colors duration-150',
          pull.state === 'armed' && 'text-positive',
        )}
      >
        {pull.state === 'refreshing' ? (
          <LoaderCircleIcon
            aria-hidden="true"
            className="size-4 animate-spin motion-reduce:animate-none"
          />
        ) : (
          <motion.span style={{ rotate }} className="flex">
            <ArrowDownIcon aria-hidden="true" className="size-4" />
          </motion.span>
        )}
        {PULL_LABEL[pull.state]}
      </div>
    </motion.div>
  );
}

/**
 * The Placeholder Page: blank while its page loads, with a spinner, or what
 * went wrong and a way to try again.
 */
function TurnPlaceholder(props: {
  readonly load: string;
  readonly retry: () => void;
}) {
  if (props.load === 'failed') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <TriangleAlertIcon
          aria-hidden="true"
          className="size-5 text-destructive"
        />
        <p className="text-sm text-muted-foreground">
          This page didn&apos;t load.
        </p>
        <Button variant="outline" className="min-h-11" onClick={props.retry}>
          Try again
        </Button>
      </div>
    );
  }
  return (
    <div className="flex h-full items-center justify-center">
      {props.load === 'loading' ? (
        <LoaderCircleIcon
          aria-hidden="true"
          className="size-5 animate-spin text-muted-foreground motion-reduce:animate-none"
        />
      ) : null}
    </div>
  );
}

function Drawer(props: {
  readonly sidebar: ReturnType<typeof useSidebar>;
  readonly menuButton: RefObject<HTMLButtonElement | null>;
}) {
  const { sidebar } = props;
  const aside = useRef<HTMLElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  // Whether any of the scrim shows; flips rarely, unlike progress itself.
  const [showing, setShowing] = useState(false);
  useMotionValueEvent(sidebar.progress, 'change', (v) => setShowing(v > 0));

  // Focus moves in as it opens and back to the menu button as it closes.
  useEffect(() => {
    if (sidebar.open) {
      close.current?.focus({ preventScroll: true });
      return;
    }
    if (aside.current?.contains(document.activeElement) === true) {
      props.menuButton.current?.focus({ preventScroll: true });
    }
  }, [sidebar.open, props.menuButton]);

  useEffect(() => {
    if (!sidebar.open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') sidebar.setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sidebar]);

  return (
    <>
      <motion.div
        aria-hidden="true"
        style={{ opacity: sidebar.progress }}
        onClick={() => sidebar.setOpen(false)}
        className={cn(
          'fixed inset-0 z-40 bg-black/45',
          !(sidebar.open || sidebar.dragging || showing) &&
            'pointer-events-none',
        )}
      />
      <motion.aside
        ref={aside}
        id="menu"
        aria-label="Menu"
        inert={!sidebar.open}
        style={{ x: sidebar.x, width: DRAWER }}
        className="fixed inset-y-0 left-0 z-50 flex flex-col overflow-y-auto bg-background pt-[env(safe-area-inset-top)] pb-[max(1rem,env(safe-area-inset-bottom))] pl-[env(safe-area-inset-left)] shadow-2xl ring-1 ring-foreground/10"
      >
        <div className="flex h-14 shrink-0 items-center justify-between pr-1.5 pl-5">
          <span className="text-sm font-semibold">PWA Playground</span>
          <Button
            ref={close}
            variant="ghost"
            size="icon"
            className="size-11"
            aria-label="Close the menu"
            onClick={() => sidebar.setOpen(false)}
          >
            <XIcon aria-hidden="true" />
          </Button>
        </div>
        <div className="px-2 pb-4">
          <ChapterNav
            testIdPrefix="menu"
            onNavigate={() => sidebar.setOpen(false)}
          />
        </div>
      </motion.aside>
    </>
  );
}

function Frame(props: { readonly children: ReactNode }) {
  const touch = useTouch();
  const wide = useWide();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  // Growing past the drawer's breakpoint puts the nav beside the page.
  useEffect(() => {
    if (wide) setMenuOpen(false);
  }, [wide]);

  const sidebar = useSidebar({
    side: 'left',
    width: DRAWER,
    edge: EDGE,
    enabled: touch && !wide,
    open: menuOpen,
    onOpenChange: setMenuOpen,
  });
  const pull = usePullToRefresh({
    enabled: touch && !menuOpen,
    onRefresh: useRefreshAll(),
  });

  return (
    <>
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:ring-2 focus:ring-ring"
      >
        Skip to content
      </a>
      <Header
        menuButton={menuButton}
        menuOpen={menuOpen}
        onMenu={() => sidebar.setOpen(true)}
      />
      <div inert={menuOpen} className="flex min-h-0 flex-1">
        <aside className="hidden w-60 shrink-0 overflow-y-auto border-r border-border px-3 py-8 lg:block">
          <ChapterNav morph testIdPrefix="nav" />
        </aside>
        <PageTurnProvider
          swipe={{ enabled: touch && !menuOpen, edge: wide ? 0 : EDGE }}
          load={simulateLoad}
        >
          <div className="relative min-w-0 flex-1 overflow-hidden">
            <PullIndicator pull={pull} />
            <TurnSurface
              className="h-full bg-muted"
              placeholder={(turn) => <TurnPlaceholder {...turn} />}
            >
              <div
                id="content"
                data-scroll-restoration-id="content"
                className="h-full overflow-x-hidden overflow-y-auto overscroll-contain"
              >
                <motion.div
                  style={{ y: pull.y }}
                  className="mx-auto w-full max-w-[52rem] pr-[max(1rem,env(safe-area-inset-right))] pb-[env(safe-area-inset-bottom)] pl-[max(1rem,env(safe-area-inset-left))] sm:px-8"
                >
                  {props.children}
                </motion.div>
              </div>
            </TurnSurface>
          </div>
        </PageTurnProvider>
      </div>
      {wide ? null : <Drawer sidebar={sidebar} menuButton={menuButton} />}
    </>
  );
}

/**
 * The app frame, and one Gesture Provider for all of it. On touch screens a
 * Swipe from the left edge opens the menu, a Swipe sideways turns the page
 * and a pull at the top refreshes. Demo stages are trapped zones inside it.
 */
export function AppShell(props: { readonly children: ReactNode }) {
  return (
    <GestureProvider>
      <RefreshProvider>
        <GestureZone
          style={READABLE}
          className="fixed inset-0 flex flex-col bg-background"
        >
          <Frame>{props.children}</Frame>
        </GestureZone>
        <appTheme.StatusBar />
      </RefreshProvider>
    </GestureProvider>
  );
}
