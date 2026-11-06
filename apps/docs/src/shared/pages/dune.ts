import { Page } from '@kestack/kabuki/routing';
import { about } from '../content/index.ts';

/** dune's landing page, full screen: what it is, live, and its API. */
export const Dune = Page.define({
  path: '/dune',
  metadata: about(
    '/dune',
    'dune',
    'Real, interactive HTML drawn into a canvas and lit by shaders.',
  ),
});

export const DuneLive = Dune.build();
