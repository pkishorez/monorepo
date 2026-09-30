import { createRouter } from '@tanstack/react-router';
import { PageSkeleton } from './components/index.ts';
import { pageTurn } from './lib/page-turn.ts';
import { routeTree } from './routeTree.gen';

export function getRouter() {
  return createRouter({
    routeTree,
    defaultPreload: 'intent',
    scrollRestoration: true,
    // Pages scroll inside the app frame (shell/app-shell.tsx), not the window.
    scrollToTopSelectors: ['#content'],
    // Turns between a page and its neighbours, crossfades anything else,
    // where the browser has view transitions; plain navigation elsewhere.
    defaultViewTransition: pageTurn.viewTransition,
    // What a page shows while it loads, and in a Page Turn before it has.
    defaultPendingComponent: PageSkeleton,
  });
}
