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

/** To-dos, full screen: the smallest Kabuki app, with its devtools. */
export const TodosDemo = Page.define({
  path: '/demos/todos',
  metadata: about(
    '/kabuki/demos/todos',
    'To-dos · kabuki',
    'A to-do list drawn as the kabuki Actors it is: a filter held as a State, a to-do per Actor, with Time Travel.',
  ),
});

export const TodosDemoLive = Page.build(TodosDemo);

/** A demo staged to be watched, picked by the URL's hash: `#todos` or `#opening-an-app`. */
export const StageDemo = Page.define({
  path: '/demos/stage',
  metadata: about(
    '/kabuki/demos/stage',
    'Stage · kabuki',
    'A kabuki demo staged to be watched: the app over its tree of Actors, and its History.',
  ),
});

export const StageDemoLive = Page.build(StageDemo);
