import { Context, type Effect } from 'effect';

import type {
  GitUnavailableError,
  InvalidRootError,
} from '../../../rpc/project/contract/index.js';

export class Snapshots extends Context.Service<Snapshots, SnapshotsShape>()(
  'Monoverse/server/Snapshots',
) {}

export interface Snapshot {
  readonly root: string;
  readonly source:
    | {
        readonly kind: 'disk';
        readonly folder: string;
      }
    | {
        readonly kind: 'git';
        readonly commit: string;
      };
  readonly list: (folder: string) => Promise<ReadonlyArray<string>>;
  readonly read: (path: string) => Promise<Uint8Array | undefined>;
  readonly readMany: (
    paths: ReadonlyArray<string>,
  ) => Promise<ReadonlyMap<string, Uint8Array>>;
  readonly onDisk: () => Promise<string>;
}
export interface SnapshotsShape {
  readonly open: (
    root: string,
    branch: string | null,
  ) => Effect.Effect<Snapshot, InvalidRootError | GitUnavailableError>;
  readonly existingRoot: (
    root: string,
  ) => Effect.Effect<string, InvalidRootError>;
}
