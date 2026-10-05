import { createRouter } from '@tanstack/react-router';
import { PAGE_TRANSITION } from '../../client/screens/shell/index.ts';
import { routeTree } from './routeTree.gen';

// Where the browser can tell a slide up from down, every Go slides the
// page; elsewhere it goes at once.
const slides = () =>
  typeof CSS !== 'undefined' &&
  CSS.supports('selector(:active-view-transition-type(up))');

export function getRouter() {
  return createRouter({
    routeTree,
    defaultPreload: 'intent',
    scrollRestoration: true,
    defaultViewTransition: slides() && PAGE_TRANSITION,
  });
}
