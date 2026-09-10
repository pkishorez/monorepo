import { Effect, Schema } from 'effect';
import { StoreDetails } from '../../../shared/rpc/store-details/index.ts';
import {
  persistedStateView,
  resourceSummaryView,
  StoreDetailsError,
} from '../../../shared/contracts/store-details/index.ts';
import { getDetails } from '../../workflows/store-details/index.ts';
const names = Schema.Struct({
  storeName: Schema.String,
  data: Schema.Array(Schema.String),
});
const decode =
  <A>(schema: Schema.Codec<A>) =>
  (value: unknown) =>
    Schema.decodeUnknownEffect(schema)(value).pipe(
      Effect.mapError(() => new StoreDetailsError({ code: 'invalid-state' })),
    );
export const StoreDetailsHandlers = StoreDetails.toLayer({
  'AlchemyStateStore.ListStacks': (input) =>
    getDetails(input, { kind: 'stacks' }).pipe(Effect.flatMap(decode(names))),
  'AlchemyStateStore.ListStages': (input) =>
    getDetails(input, { kind: 'stages', ...input }).pipe(
      Effect.flatMap(decode(names)),
    ),
  'AlchemyStateStore.ListResources': (input) =>
    getDetails(input, { kind: 'resources', ...input }).pipe(
      Effect.flatMap(decode(names)),
    ),
  'AlchemyStateStore.ListResourceSummaries': (input) =>
    getDetails(input, { kind: 'summaries', ...input }).pipe(
      Effect.flatMap(
        decode(
          Schema.Struct({
            storeName: Schema.String,
            data: Schema.Array(resourceSummaryView),
          }),
        ),
      ),
    ),
  'AlchemyStateStore.GetStageOutputs': (input) =>
    getDetails(input, { kind: 'outputs', ...input }).pipe(
      Effect.flatMap(
        decode(Schema.Struct({ storeName: Schema.String, data: Schema.Json })),
      ),
    ),
  'AlchemyStateStore.GetResourceState': (input) =>
    getDetails(input, { kind: 'resource', ...input }).pipe(
      Effect.flatMap(
        decode(
          Schema.Struct({
            storeName: Schema.String,
            data: Schema.NullOr(persistedStateView),
          }),
        ),
      ),
    ),
});
