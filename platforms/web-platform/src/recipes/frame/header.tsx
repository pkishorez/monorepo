import type { ReactNode } from 'react';
import { ChevronLeftIcon, PanelLeftIcon } from 'lucide-react';
import { Button } from '#components/button';
import { Separator } from '#components/separator';
import { useFrame } from './frame/index.ts';

/** What an app puts in its header. */
export interface HeaderConfig {
  /** Where you are. */
  readonly title: ReactNode;
  /** At the right edge: the page's own actions, and the account menu when there's no sidebar. */
  readonly actions?: ReactNode;
}

/**
 * The page's bar: the sidebar's button and a divider, when there's a sidebar,
 * then where you are, then the actions. Under the status bar on a phone.
 */
export function Header(props: { readonly config: HeaderConfig }) {
  const { open, toggle, hasSidebar, isMobile, phone } = useFrame();
  // A phone's sidebar that is a page of its own is gone back to, not toggled.
  const back = isMobile && phone === 'page';
  return (
    <header
      data-slot="app-shell-header"
      className="box-content flex h-14 shrink-0 items-center gap-2 border-b border-border px-4 pt-[env(safe-area-inset-top)] md:h-12 md:pt-0"
    >
      {hasSidebar ? (
        <>
          <Button
            variant="ghost"
            size="icon"
            aria-label={back ? 'Back' : 'Toggle sidebar'}
            aria-expanded={back ? undefined : open}
            className="-ml-2 size-11 rounded-full hover:bg-transparent aria-expanded:bg-transparent md:-ml-1 md:size-8 dark:hover:bg-transparent"
            onClick={toggle}
          >
            {back ? (
              <ChevronLeftIcon aria-hidden="true" className="size-6" />
            ) : (
              <PanelLeftIcon aria-hidden="true" />
            )}
          </Button>
          {back ? null : (
            <Separator
              orientation="vertical"
              className="mr-1 data-[orientation=vertical]:h-4 data-[orientation=vertical]:self-center"
            />
          )}
        </>
      ) : null}
      <div className="min-w-0 flex-1 truncate text-sm font-medium">
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
