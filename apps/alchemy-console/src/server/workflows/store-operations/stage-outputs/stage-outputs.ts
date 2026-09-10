import { Effect, Schema } from 'effect';
import { stageOutputsView } from '../../../../shared/contracts/stage-outputs/index.ts';
import {
  StoreDetailsError,
  type readStageTarget,
} from '../../../../shared/contracts/state-address/index.ts';
import { read } from '../../../services/alchemy-state/index.ts';

export const getOutputs = (
  connection: Parameters<typeof read>[0],
  input: typeof readStageTarget.Type,
) =>
  read(connection, { kind: 'outputs', ...input }).pipe(
    Effect.flatMap((value) =>
      Schema.decodeUnknownEffect(stageOutputsView.fields.data)(value).pipe(
        Effect.mapError(() => new StoreDetailsError({ code: 'invalid-state' })),
      ),
    ),
  );
