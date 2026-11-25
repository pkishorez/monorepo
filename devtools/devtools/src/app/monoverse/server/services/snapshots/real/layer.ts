import { Effect, Layer } from 'effect';

import { Git } from '../../git/contract/index.js';
import { Snapshots } from '../contract/index.js';
import { copiesFolder } from './commit-copy.js';
import { openSnapshot } from './open.js';
import { existingRoot } from './root.js';

export const snapshotsLayerAt = (copies: string) =>
  Layer.effect(
    Snapshots,
    Effect.gen(function* () {
      const git = yield* Git;
      return Snapshots.of({
        open: (root, branch) => openSnapshot(git, root, branch, copies),
        existingRoot,
      });
    }),
  );

export const snapshotsLayer = snapshotsLayerAt(copiesFolder);
