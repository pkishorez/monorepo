import { Page } from '@kestack/kabuki/routing';
import { about } from '../../content/index.ts';

/** Opening an app, full screen: the demo with nothing of the site around it. */
export const Demo = Page.define({
  path: '/demos/opening-an-app',
  metadata: about(
    '/kabuki/demos/opening-an-app',
    'Opening an app · kabuki',
    'An app opening, drawn as the tree of kabuki Actors it is: States, Children, Workers, Commands and Capabilities, with Time Travel.',
  ),
});

export const DemoLive = Page.build(Demo);
