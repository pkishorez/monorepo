import type { ReactNode } from 'react';
import { Router } from '@kestack/kabuki/routing';
import { Button } from '@kestack/web-platform/ui/components/button';
import { MoonIcon, SunIcon } from 'lucide-react';
import { router } from '../../../shared/index.ts';
import { Theme } from './theme.ts';

/*
 * The app's name, back to the list, and the theme switch; then the page.
 * Both keep clear of the notch and the home bar (`.gutter`). On a phone the
 * header scrolls away, leaving the screen to the player; from a laptop up
 * it stays.
 */
export function Layout({ children }: { readonly children: ReactNode }) {
  const { toggleTheme } = Theme.useTheme();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border bg-background pt-[env(safe-area-inset-top)] lg:sticky lg:top-0 lg:z-40">
        <div className="gutter mx-auto flex h-14 w-full max-w-[92rem] items-center justify-between">
          <Router.Link
            to={router.List()}
            className="-ml-2 flex min-h-11 items-center rounded-md px-2 font-semibold tracking-tight"
          >
            ke-video
          </Router.Link>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            aria-label="Switch theme"
            className="-mr-2 size-11 text-muted-foreground"
          >
            <MoonIcon className="dark:hidden" />
            <SunIcon className="hidden dark:block" />
          </Button>
        </div>
      </header>
      <main className="gutter mx-auto w-full max-w-[92rem] flex-1 pt-6 pb-[calc(4rem+env(safe-area-inset-bottom))] sm:pt-8">
        {children}
      </main>
    </div>
  );
}
