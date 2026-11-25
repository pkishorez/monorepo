import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Effect, Layer } from 'effect';
import { afterAll } from 'vitest';

import { gitLayer } from '../services/git/real/index.js';
import { Snapshots } from '../services/snapshots/contract/index.js';
import { snapshotsLayerAt } from '../services/snapshots/real/index.js';

export const copies = mkdtempSync(join(tmpdir(), 'monoverse-copies-'));
afterAll(() => rmSync(copies, { recursive: true, force: true }));

export const servicesLayer = snapshotsLayerAt(copies).pipe(
  Layer.provideMerge(gitLayer),
);

export const openSnapshot = (root: string, branch: string | null) =>
  Effect.flatMap(Snapshots, (snapshots) => snapshots.open(root, branch)).pipe(
    Effect.provide(servicesLayer),
  );
