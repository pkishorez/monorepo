import { MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';
import { column } from './styles.ts';
import { Footer } from './footer.tsx';
import { Nav } from './nav.tsx';
import { Progress } from './progress.tsx';

/*
 * What is around every page: a bar while the Router holds a move, the
 * nav, the page itself, and a footer that says when the server drew this
 * page and whether the Runtime has started. Everything that moves stays
 * still for anyone who asks for less motion.
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
    <MotionConfig reducedMotion="user">
      <div className="flex min-h-dvh flex-col">
        <Progress />
        <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md">
          <Nav />
        </header>
        <main className={`${column} flex-1 py-6 sm:py-10`}>{children}</main>
        <Footer live={live} />
      </div>
    </MotionConfig>
  );
}
