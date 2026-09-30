import { createRouter } from '@tanstack/react-router';
import { pageTurnTransition } from './page-turn/index.ts';
import { routeTree } from './routeTree.gen';

export function getRouter() {
  return createRouter({
    routeTree,
    defaultPreload: 'intent',
    scrollRestoration: true,
    // Pages scroll inside the app frame (shell/app-shell.tsx), not the window.
    scrollToTopSelectors: ['#content'],
    // Crossfades the page, or replays a Page Turn through history, where the
    // browser has view transitions; plain navigation elsewhere.
    defaultViewTransition: pageTurnTransition,
  });
}
