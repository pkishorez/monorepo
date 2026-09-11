import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';
import { stageTarget } from '../../contracts/targets/index.ts';
import {
  deletionOptions,
  previewEvent,
  deletionEvent,
  DeletionError,
} from '../../contracts/deletion/index.ts';

export const Deletion = RpcGroup.make(
  Rpc.make('Deletion.Preview', {
    payload: Schema.Struct({
      ...stageTarget.fields,
      ...deletionOptions.fields,
    }),
    success: previewEvent,
    error: DeletionError,
    stream: true,
  }),
  Rpc.make('Deletion.Delete', {
    payload: {
      ...stageTarget.fields,
      ...deletionOptions.fields,
      fingerprint: Schema.String,
      acknowledgement: Schema.optional(Schema.String),
    },
    success: deletionEvent,
    error: DeletionError,
    stream: true,
  }),
);
