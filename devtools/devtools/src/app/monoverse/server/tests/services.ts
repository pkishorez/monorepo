import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Effect, Layer } from 'effect';
import { afterAll } from 'vitest';

import { gitLayer } from '../services/git/real/index.js';
import { Snapshots } from '../services/snapshots/contract/index.js';
import { snapshotsLayerAt } from '../services/snapshots/real/index.js';

/*
 * The real Git and Snapshots services, as `server/index.ts` provides them,
 * for the server's tests; a commit's copies on disk go in a folder of the
 * test file's own, never the shared one under the OS temp folder.
 */

/** Where the tests' copies of commits go, removed after the test file. */
export const copies = mkdtempSync(join(tmpdir(), 'monoverse-copies-'));
afterAll(() => rmSync(copies, { recursive: true, force: true }));

export const servicesLayer = snapshotsLayerAt(copies).pipe(
  Layer.provideMerge(gitLayer),
);

/** The Project folder `root` at `branch` (null: as it is on disk), through the real services. */
export const openSnapshot = (root: string, branch: string | null) =>
  Effect.flatMap(Snapshots, (snapshots) => snapshots.open(root, branch)).pipe(
    Effect.provide(servicesLayer),
  );
