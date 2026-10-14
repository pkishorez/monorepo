import type { ReactNode } from 'react';
import { column } from './styles.ts';
import { Footer } from './footer.tsx';
import { Nav } from './nav.tsx';
import { Progress } from './progress.tsx';

/*
 * What is around every page: a bar while the Router holds a move, the
 * nav, the page itself, and a footer that says when the server drew this
 * page and whether the Runtime has started.
 */

export function Layout({
  live,
  children,
}: {
  /** The Time of the Runtime's last tick, or `null` before it starts. */
  readonly live: number | null;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <Progress />
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-sm">
        <Nav />
      </header>
      <main className={`${column} flex-1 py-10 sm:py-14`}>{children}</main>
      <Footer live={live} />
    </div>
  );
}
