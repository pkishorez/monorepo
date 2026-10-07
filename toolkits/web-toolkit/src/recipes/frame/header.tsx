import type { ReactNode } from 'react';
import { PanelLeftIcon } from 'lucide-react';
import { Button } from '#components/ui/button';
import { Separator } from '#components/ui/separator';
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
  const { open, toggle, hasSidebar } = useFrame();
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
            aria-label="Toggle sidebar"
            aria-expanded={open}
            className="-ml-2 size-11 rounded-full hover:bg-transparent aria-expanded:bg-transparent md:-ml-1 md:size-8 dark:hover:bg-transparent"
            onClick={toggle}
          >
            <PanelLeftIcon aria-hidden="true" />
          </Button>
          <Separator
            orientation="vertical"
            className="mr-1 data-[orientation=vertical]:h-4 data-[orientation=vertical]:self-center"
          />
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
