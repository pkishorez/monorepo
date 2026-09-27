import { createRouter } from '@tanstack/react-router';
import { viewTransitionTypes } from './lib/scenarios.ts';
import { routeTree } from './routeTree.gen';

export function getRouter() {
  return createRouter({
    routeTree,
    defaultPreload: 'intent',
    scrollRestoration: true,
    // Uses document.startViewTransition where it exists; plain navigation elsewhere.
    defaultViewTransition: { types: viewTransitionTypes },
  });
}
