import { Layer } from 'effect';
import * as Provider from 'alchemy/Provider';
import {
  Providers,
  SnapshotGuard,
  SnapshotGuardProvider,
} from './snapshot-guard/index.js';

/**
 * The provider layer every std-toolkit resource needs. Merge it into a
 * stack's `providers` beside the cloud providers you deploy with.
 */
export const providers = () =>
  Layer.effect(Providers, Provider.collection([SnapshotGuard])).pipe(
    Layer.provideMerge(SnapshotGuardProvider()),
  );
