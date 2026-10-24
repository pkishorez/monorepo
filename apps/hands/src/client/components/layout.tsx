import type { ReactNode } from 'react';
import { ThemeToggle } from './theme-toggle.tsx';

/*
 * What is around the page: the site's name and what it is, the switch
 * between light and dark, then the page, wide, for the stage.
 */

export function Layout({ children }: { readonly children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 w-full max-w-[90rem] items-center gap-3 px-5">
          <span className="font-semibold tracking-tight">Hands</span>
          <span className="hidden text-sm text-muted-foreground sm:inline">
            A gesture playground on MediaPipe
          </span>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[90rem] flex-1 px-5 pt-6 pb-16">
        {children}
      </main>
    </div>
  );
}
