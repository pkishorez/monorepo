import { Layer } from 'effect';
import * as Provider from 'alchemy/Provider';
import { D1Table, D1TableProvider } from './d1/index.js';
import {
  Providers,
  SnapshotGuard,
  SnapshotGuardProvider,
} from './snapshot-guard/index.js';

export const providers = () =>
  Layer.effect(Providers, Provider.collection([SnapshotGuard, D1Table])).pipe(
    Layer.provideMerge(SnapshotGuardProvider()),
    Layer.provideMerge(D1TableProvider()),
  );
