import { Layer } from 'effect';
import { toReact } from 'effect-oak/react';
import * as actor from './actor/index.js';
import * as capabilities from './capabilities/index.js';
import * as commands from './commands/index.js';
import * as moreActors from './more-actors/index.js';
import * as motion from './motion/index.js';
import * as states from './states/index.js';

/*
 * The seven chapters, each its own app with its own Log, so each chapter's
 * devtools tell only its story. Each adds one idea to the one before; Motion
 * and Time Travel run the same Actors as Capabilities.
 */
export const CHAPTERS = [
  {
    title: 'An Actor',
    App: toReact(actor.Rocket, actor.RocketView, Layer.empty),
  },
  {
    title: 'States',
    App: toReact(states.Rocket, states.RocketView, Layer.empty),
  },
  {
    title: 'More Actors',
    App: toReact(moreActors.LaunchSite, moreActors.LaunchSiteView, Layer.empty),
  },
  {
    title: 'Capabilities',
    App: toReact(
      capabilities.LaunchSite,
      capabilities.LaunchSiteView,
      Layer.empty,
    ),
  },
  {
    title: 'Motion',
    App: toReact(capabilities.LaunchSite, motion.LaunchSiteView, Layer.empty),
  },
  {
    title: 'Time Travel',
    App: toReact(capabilities.LaunchSite, motion.LaunchSiteView, Layer.empty),
  },
  {
    title: 'Commands',
    deeper: true,
    App: toReact(commands.LaunchSite, commands.LaunchSiteView, Layer.empty),
  },
] as const;

export type Chapter = 1 | 2 | 3 | 4 | 5 | 6 | 7;
