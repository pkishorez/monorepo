import { Layer } from 'effect';
import {
  RetiredDeployGuard,
  RetiredSnapshotGuard,
  retiredGuardProviders,
} from '../2026-11-stored-contract/alchemy/index.js';

/*
 * The fixed entry point for the Alchemy providers' migrations (ADR 0020):
 * the resource types a migration keeps registered, and their providers.
 * It is apart from `Migrations` so the runtime, which imports that, never
 * loads Alchemy. With no migration registered, it has no resources and
 * `Layer.empty` for providers. Deleting a migration is deleting its folder
 * and its lines here.
 */
export const AlchemyMigrations = {
  resources: [RetiredDeployGuard, RetiredSnapshotGuard],
  providers: () => Layer.mergeAll(retiredGuardProviders()),
} as const;
