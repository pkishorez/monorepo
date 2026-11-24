import { Effect, Layer } from 'effect';

import { gitLayer } from '../services/git/real/index.js';
import { Snapshots } from '../services/snapshots/contract/index.js';
import { snapshotsLayer } from '../services/snapshots/real/index.js';

/*
 * The real Git and Snapshots services, as `server/index.ts` provides them,
 * for the server's tests.
 */

export const servicesLayer = snapshotsLayer.pipe(Layer.provideMerge(gitLayer));

/** The Project folder `root` at `branch` (null: as it is on disk), through the real services. */
export const openSnapshot = (root: string, branch: string | null) =>
  Effect.flatMap(Snapshots, (snapshots) => snapshots.open(root, branch)).pipe(
    Effect.provide(servicesLayer),
  );
