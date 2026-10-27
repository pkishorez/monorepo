import {
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from 'react';
import { ChevronLeftIcon, PanelLeftIcon } from 'lucide-react';
import { Button } from '#components/button';
import { useFrame } from './frame/index.ts';

/** What an app puts in its header. */
export interface HeaderConfig {
  /** Where you are. */
  readonly title: ReactNode;
  /** At the right edge: the page's own actions, and the account menu when there's no sidebar. */
  readonly actions?: ReactNode;
}

/**
 * Whether the page under `header` is scrolled down: the last of its
 * scrollers to move, while it is still there and off its top. A scroller
 * gone, as a new page is drawn, counts as at its top until one moves.
 */
const useScrolledUnder = (header: RefObject<HTMLElement | null>) => {
  const [under, setUnder] = useState(false);
  useEffect(() => {
    const column = header.current?.parentElement;
    if (column === null || column === undefined) return;
    let last: Element | null = null;
    const check = () =>
      setUnder(last !== null && last.isConnected && last.scrollTop > 0);
    const scrolled = (event: Event) => {
      const target = event.target;
      // Only what scrolls up and down: a wide code block moving sideways is not the page.
      if (!(target instanceof Element)) return;
      if (target.scrollHeight <= target.clientHeight + 1) return;
      last = target;
      check();
    };
    column.addEventListener('scroll', scrolled, {
      capture: true,
      passive: true,
    });
    const pages = new MutationObserver(check);
    pages.observe(column, { childList: true, subtree: true });
    return () => {
      column.removeEventListener('scroll', scrolled, { capture: true });
      pages.disconnect();
    };
  }, [header]);
  return under;
};

/**
 * The page's bar: the sidebar's button, when there's a sidebar, then where
 * you are, then the actions. Under the status bar on a phone. Its bottom
 * edge shows only once the page is scrolled under it.
 */
export function Header(props: { readonly config: HeaderConfig }) {
  const { open, toggle, hasSidebar, isMobile, sidebarMode } = useFrame();
  // A phone's sidebar that is a page of its own is gone back to, not toggled.
  const back = isMobile && sidebarMode === 'fullscreen';
  const self = useRef<HTMLElement>(null);
  const under = useScrolledUnder(self);
  return (
    <header
      ref={self}
      data-slot="app-shell-header"
      data-scrolled={under ? '' : undefined}
      className="box-content flex h-14 shrink-0 items-center gap-2 border-b border-transparent px-4 pt-[env(safe-area-inset-top)] transition-colors duration-200 data-scrolled:border-border md:h-12 md:pt-0"
    >
      {hasSidebar ? (
        <Button
          variant="ghost"
          size="icon"
          aria-label={back ? 'Back' : 'Toggle sidebar'}
          aria-expanded={back ? undefined : open}
          className="-ml-2 size-11 rounded-full hover:bg-transparent aria-expanded:bg-transparent keyboard:md:-ml-1 keyboard:md:size-8 dark:hover:bg-transparent"
          onClick={toggle}
        >
          {back ? (
            <ChevronLeftIcon aria-hidden="true" className="size-6" />
          ) : (
            <PanelLeftIcon aria-hidden="true" />
          )}
        </Button>
      ) : null}
      <div className="min-w-0 flex-1 truncate text-sm font-medium max-md:text-base">
        {props.config.title}
      </div>
      {props.config.actions === undefined ? null : (
        <div className="-mr-2 flex shrink-0 items-center gap-1 md:-mr-1">
          {props.config.actions}
        </div>
      )}
    </header>
  );
}
