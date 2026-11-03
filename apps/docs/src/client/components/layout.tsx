import type { ReactNode } from 'react';
import { GestureProvider, GestureZone } from '@kestack/web-platform/ui/input';
import { Footer } from './footer.tsx';
import { Header } from './header.tsx';
import { MENU_HOST } from './mobile-nav.tsx';
import { Progress } from './progress.tsx';

/**
 * What is around every page: a bar while the Router holds a move, the
 * header, the page and the footer, the same on every page. All of it is
 * one Gesture Zone, so a swipe right anywhere can pull out the menu, which
 * is put in the host at its end; the zone keeps text selectable, as a page
 * of words should be.
 */
export function Layout({ children }: { readonly children: ReactNode }) {
  return (
    <GestureProvider>
      <GestureZone
        className="flex min-h-dvh flex-col"
        style={{
          userSelect: 'auto',
          WebkitUserSelect: 'auto',
          WebkitTouchCallout: 'default',
        }}
      >
        <Progress />
        <Header />
        <div className="flex-1">{children}</div>
        <Footer />
        <div id={MENU_HOST} />
      </GestureZone>
    </GestureProvider>
  );
}
