import { Layer } from 'effect';
import * as Provider from 'alchemy/Provider';
import { D1Table, D1TableProvider } from './d1/index.js';
import {
  DeployGuardProvider,
  DeployGuardResource,
  Providers,
  RetiredSnapshotGuardProvider,
  RetiredSnapshotGuardResource,
} from './deploy-guard/index.js';

export const providers = () =>
  Layer.effect(
    Providers,
    Provider.collection([
      DeployGuardResource,
      RetiredSnapshotGuardResource,
      D1Table,
    ]),
  ).pipe(
    Layer.provideMerge(DeployGuardProvider()),
    Layer.provideMerge(RetiredSnapshotGuardProvider()),
    Layer.provideMerge(D1TableProvider()),
  );
