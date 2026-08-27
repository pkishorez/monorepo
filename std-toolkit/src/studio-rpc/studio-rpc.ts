import { Effect } from 'effect';
import { RpcGroup } from 'effect/unstable/rpc';
import type { StdTable } from '../db/std-table/table/index.js';
import { makeEntityReader } from './entity-reader.js';
import {
  GetEntityRpc,
  GetTableSnapshotRpc,
  QueryEntitiesRpc,
  StudioSnapshotFailed,
} from './protocol.js';

export class StudioRpc extends RpcGroup.make(
  GetTableSnapshotRpc,
  GetEntityRpc,
  QueryEntitiesRpc,
) {
  static layer<Name extends string>(table: StdTable<Name>) {
    const entities = makeEntityReader(table);
    return StudioRpc.toLayer({
      'Studio.GetTableSnapshot': () =>
        Effect.try({
          try: () => table.snapshot(),
          catch: (cause) => cause,
        }).pipe(
          Effect.tapError((cause) => Effect.logError(cause)),
          Effect.mapError(
            (cause) =>
              new StudioSnapshotFailed({
                message:
                  cause instanceof Error
                    ? cause.message
                    : 'Table snapshot capture failed',
              }),
          ),
        ),
      'Studio.GetEntity': entities.get,
      'Studio.QueryEntities': entities.query,
    });
  }
}
