import { Context, type Effect } from 'effect';
import type { PluginState } from './values.js';

/*
 * The Capability a CLI Provides above the Actors that keep its Plugins: each
 * reports its Plugin State through it, without knowing who listens, and
 * which Release it serves. The two differ while a new Release downloads:
 * the State says Downloading it, and the one before is still served.
 */

export class Plugins extends Context.Service<
  Plugins,
  {
    /** A Request: the Plugin `name` now stands at `state`. */
    readonly report: (name: string, state: PluginState) => Effect.Effect<void>;
    /** A Request: the Plugin `name` now serves the Release `hash` on its socket; null while none listens. */
    readonly serves: (name: string, hash: string | null) => Effect.Effect<void>;
  }
>()('@kestack/cli-platform/Plugins') {}
