// The real chapter sources of the Rockets demo, read as text at build time,
// so the code on screen is the code that runs.
import actorRocket from '../../../../docs/src/demos/effect-oak/rockets/actor/rocket.ts?raw';
import actorView from '../../../../docs/src/demos/effect-oak/rockets/actor/view.tsx?raw';
import capabilitiesLaunchSite from '../../../../docs/src/demos/effect-oak/rockets/capabilities/launch-site.ts?raw';
import capabilitiesRocket from '../../../../docs/src/demos/effect-oak/rockets/capabilities/rocket.ts?raw';
import commandsRocket from '../../../../docs/src/demos/effect-oak/rockets/commands/rocket.ts?raw';
import moreActorsLaunchSite from '../../../../docs/src/demos/effect-oak/rockets/more-actors/launch-site.ts?raw';
import moreActorsRocket from '../../../../docs/src/demos/effect-oak/rockets/more-actors/rocket.ts?raw';
import motionView from '../../../../docs/src/demos/effect-oak/rockets/motion/view.tsx?raw';
import statesRocket from '../../../../docs/src/demos/effect-oak/rockets/states/rocket.ts?raw';

export const sources = {
  actorRocket,
  actorView,
  statesRocket,
  moreActorsLaunchSite,
  moreActorsRocket,
  capabilitiesLaunchSite,
  capabilitiesRocket,
  motionView,
  commandsRocket,
};

// What `tsc` reports when the Launch Site no longer Provides Weather
// (capabilities/launch-site.ts without its `provides`), with the Actor's
// type arguments shortened.
export const missingWeather = {
  text: 'rockets',
  message:
    "TS2322: Property 'missingCapabilities' is missing in type 'Many<Actor<\"Rocket\", …, Weather>>' but required in type '{ readonly missingCapabilities: Weather; }'.",
};
