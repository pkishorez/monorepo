import { Context, type Effect } from 'effect';
import type { PluginState } from './values.js';

/*
 * The Capability a CLI Provides above the Actors that keep its Plugins: each
 * reports its Plugin State through it, without knowing who listens.
 */

export class Plugins extends Context.Service<
  Plugins,
  {
    /** A Request: the Plugin `name` now stands at `state`. */
    readonly report: (name: string, state: PluginState) => Effect.Effect<void>;
  }
>()('@kestack/cli-platform/Plugins') {}
