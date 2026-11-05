import { Context, type Effect } from 'effect';
import type { Release } from '../../../../../contract/index.js';

/*
 * How the tunnel tells the Connection above it what it learned: the Releases
 * Connect Cloud wants run, and its address.
 */

export class Connection extends Context.Service<
  Connection,
  {
    /** A Request: Connect Cloud wants these Releases of its Plugins run. */
    readonly wanted: (
      releases: Readonly<Record<string, Release>>,
    ) => Effect.Effect<void>;
    /** A Request: the tunnel's address now; null while there is none. */
    readonly address: (url: string | null) => Effect.Effect<void>;
  }
>()('@kestack/connect/Connection') {}
