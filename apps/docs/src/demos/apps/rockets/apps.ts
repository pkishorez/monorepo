import { Layer } from 'effect';
import { toReact } from 'effect-oak/react';
import * as actor from './actor/index.js';
import * as capabilities from './capabilities/index.js';
import * as fleet from './fleet/index.js';
import * as state from './state/index.js';

/*
 * The Rockets demo as four apps, each with its own Log, in the order the
 * Walkthrough builds them up: one Actor, a Rocket with States and
 * Workers, a Fleet of them, and the Fleet with its Capabilities.
 */
export const APPS = {
  actor: toReact(actor.Rocket, actor.RocketView, Layer.empty, {
    name: 'rockets/actor',
  }),
  state: toReact(state.Rocket, state.RocketView, Layer.empty, {
    name: 'rockets/state',
  }),
  fleet: toReact(fleet.Fleet, fleet.FleetView, Layer.empty, {
    name: 'rockets/fleet',
  }),
  capabilities: toReact(
    capabilities.Fleet,
    capabilities.FleetView,
    Layer.empty,
    { name: 'rockets/capabilities' },
  ),
};

export type AppName = keyof typeof APPS;
