import { Schema } from 'effect';
import { Authz } from 'auth-toolkit/rpc';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';
import {
  persistedStateView,
  resourceSummaryView,
  StoreDetailsError,
} from '../../contracts/store-details/index.ts';
const name = Schema.String.check(
  Schema.makeFilter((value) => value.length > 0),
);
const store = { storeId: name };
const stack = { ...store, stack: name };
const stage = { ...stack, stage: name };
const names = Schema.Struct({
  storeName: Schema.String,
  data: Schema.Array(Schema.String),
});
export const StoreDetails = RpcGroup.make(
  Rpc.make('AlchemyStateStore.ListStacks', {
    payload: store,
    success: names,
    error: StoreDetailsError,
  }).pipe(Authz.guard()),
  Rpc.make('AlchemyStateStore.ListStages', {
    payload: stack,
    success: names,
    error: StoreDetailsError,
  }).pipe(Authz.guard()),
  Rpc.make('AlchemyStateStore.ListResources', {
    payload: stage,
    success: names,
    error: StoreDetailsError,
  }).pipe(Authz.guard()),
  Rpc.make('AlchemyStateStore.ListResourceSummaries', {
    payload: stage,
    success: Schema.Struct({
      storeName: Schema.String,
      data: Schema.Array(resourceSummaryView),
    }),
    error: StoreDetailsError,
  }).pipe(Authz.guard()),
  Rpc.make('AlchemyStateStore.GetStageOutputs', {
    payload: stage,
    success: Schema.Struct({ storeName: Schema.String, data: Schema.Json }),
    error: StoreDetailsError,
  }).pipe(Authz.guard()),
  Rpc.make('AlchemyStateStore.GetResourceState', {
    payload: { ...stage, resource: name },
    success: Schema.Struct({
      storeName: Schema.String,
      data: Schema.NullOr(persistedStateView),
    }),
    error: StoreDetailsError,
  }).pipe(Authz.guard()),
);
