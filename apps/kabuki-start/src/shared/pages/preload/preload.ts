import { Route } from '@kestack/kabuki/routing';
import { about } from '../../data/index.ts';
import { Slow } from './slow.ts';

/** Links that preload where they go: on hover or focus, once in view, or never. */
export const Preload = Route.page({
  path: '/preload',
  metadata: about(
    '/preload',
    'Preload',
    'Links that load the next page before it is clicked.',
  ),
  pages: { Slow },
}).build({});
