import { Effect, Layer } from 'effect';

import { Git } from '../../git/contract/index.js';
import { Snapshots } from '../contract/index.js';
import { copiesFolder } from './commit-copy.js';
import { openSnapshot } from './open.js';
import { existingRoot } from './root.js';

/**
 * Snapshots of a Project folder, from its worktrees on disk or from git, on
 * the Git it is given, copying a commit to disk into `copies` when asked.
 */
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

/** Snapshots, their copies on disk under the OS temp folder. */
export const snapshotsLayer = snapshotsLayerAt(copiesFolder);
