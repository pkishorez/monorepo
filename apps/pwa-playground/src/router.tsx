import { createRouter } from '@tanstack/react-router';
import { viewTransitionTypes } from './lib/chapters.ts';
import { routeTree } from './routeTree.gen';

export function getRouter() {
  return createRouter({
    routeTree,
    defaultPreload: 'intent',
    scrollRestoration: true,
    // Pages scroll inside the app frame (shell/app-shell.tsx), not the window.
    scrollToTopSelectors: ['#content'],
    // Uses document.startViewTransition where it exists; plain navigation elsewhere.
    defaultViewTransition: { types: viewTransitionTypes },
  });
}
