import type { ReactNode } from 'react';
import { Button } from '@kestack/web-platform/components/button';
import { PanelLeftIcon } from '@kestack/web-platform/components/lucide';
import { useAppShell } from '@kestack/web-platform/recipes/frame';

/*
 * The bar at the top of every page: where you are, a quiet line under it,
 * and the page's own actions. On a phone it starts with the sidebar's
 * button.
 */

export function PageBar({
  title,
  detail,
  actions,
}: {
  readonly title: ReactNode;
  readonly detail?: ReactNode;
  readonly actions?: ReactNode;
}) {
  const { isMobile, toggle } = useAppShell();
  return (
    <header className="flex min-h-14 shrink-0 items-center gap-3 border-b border-border px-4 md:px-6">
      {isMobile && (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open the sidebar"
          className="-ml-2"
          onClick={toggle}
        >
          <PanelLeftIcon aria-hidden />
        </Button>
      )}
      <div className="flex min-w-0 flex-1 flex-col py-2">
        <h1 className="truncate text-sm font-medium">{title}</h1>
        {detail !== undefined && (
          <p className="truncate text-xs text-muted-foreground">{detail}</p>
        )}
      </div>
      {actions !== undefined && (
        <div className="flex shrink-0 items-center gap-1">{actions}</div>
      )}
    </header>
  );
}
