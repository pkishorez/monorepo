import { Page } from '@kestack/kabuki/routing';
import { about } from '../../data/index.ts';
import { Slow, SlowLive } from './slow.ts';

/** Links that preload where they go: on hover or focus, once in view, or never. */
export const Preload = Page.define({
  path: '/preload',
  metadata: about(
    '/preload',
    'Preload',
    'Links that load the next page before it is clicked.',
  ),
  pages: { Slow },
});

export const PreloadLive = Page.build(Preload, {
  pages: { Slow: SlowLive },
});
