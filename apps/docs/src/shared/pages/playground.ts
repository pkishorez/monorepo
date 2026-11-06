import { Page } from '@kestack/kabuki/routing';
import { about } from '../content/index.ts';

/** The playground, full screen: real HTML drawn into a canvas, under shaders. */
export const Playground = Page.define({
  path: '/playground',
  metadata: about(
    '/playground',
    'Playground',
    'Live, interactive HTML drawn into a canvas and lit, burnt, melted and rippled by shaders.',
  ),
});

export const PlaygroundLive = Playground.build();
