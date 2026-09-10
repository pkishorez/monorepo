import { Effect, Schema } from 'effect';
import {
  resourceSummariesView,
  resourceStateView,
  type resourceTarget,
} from '../../../../shared/contracts/resource-browser/index.ts';
import {
  StoreDetailsError,
  type readStageTarget,
} from '../../../../shared/contracts/state-address/index.ts';
import { read } from '../../../services/alchemy-state/index.ts';

const invalidState = () => new StoreDetailsError({ code: 'invalid-state' });
export const listSummaries = (
  connection: Parameters<typeof read>[0],
  input: typeof readStageTarget.Type,
) =>
  read(connection, { kind: 'summaries', ...input }).pipe(
    Effect.flatMap((value) =>
      Schema.decodeUnknownEffect(resourceSummariesView.fields.data)(value).pipe(
        Effect.mapError(invalidState),
      ),
    ),
  );
export const getState = (
  connection: Parameters<typeof read>[0],
  input: typeof resourceTarget.Type,
) =>
  read(connection, { kind: 'resource', ...input }).pipe(
    Effect.flatMap((value) =>
      Schema.decodeUnknownEffect(resourceStateView.fields.data)(value).pipe(
        Effect.mapError(invalidState),
      ),
    ),
  );
