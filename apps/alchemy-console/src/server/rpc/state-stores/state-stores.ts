import { Schema } from 'effect';
import { Authz } from 'auth-toolkit/rpc';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';

const nonEmpty = Schema.String.check(
  Schema.makeFilter((value) => value.trim().length > 0),
);
const endpoint = Schema.String.check(
  Schema.makeFilter((value) => {
    try {
      const url = new URL(value);
      return (
        url.protocol === 'https:' &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash
      );
    } catch {
      return false;
    }
  }),
);

export const createStateStoreInput = Schema.Struct({
  name: nonEmpty,
  connection: Schema.Struct({
    kind: Schema.Literal('cloudflare'),
    url: endpoint,
    authToken: nonEmpty,
  }),
});

export const stateStoreView = Schema.Struct({
  id: Schema.String,
  userId: Schema.String,
  name: Schema.String,
  connection: Schema.Struct({
    kind: Schema.Literal('cloudflare'),
    url: Schema.String,
    authToken: Schema.Literal('xxxxxxxx'),
  }),
  createdAt: Schema.String,
  updatedAt: Schema.String,
});

export class StateStoreError extends Schema.Error<StateStoreError>(
  'alchemy-console/StateStoreError',
)({
  _tag: Schema.tag('StateStoreError'),
  code: Schema.Literals(['not-found', 'storage-error']),
}) {}

export const StateStores = RpcGroup.make(
  Rpc.make('AlchemyStateStore.Create', {
    payload: createStateStoreInput,
    success: stateStoreView,
    error: StateStoreError,
  }).pipe(Authz.guard()),
  Rpc.make('AlchemyStateStore.List', {
    payload: {},
    success: Schema.Array(stateStoreView),
    error: StateStoreError,
  }).pipe(Authz.guard()),
  Rpc.make('AlchemyStateStore.Rename', {
    payload: { id: nonEmpty, name: nonEmpty },
    success: stateStoreView,
    error: StateStoreError,
  }).pipe(Authz.guard()),
  Rpc.make('AlchemyStateStore.Delete', {
    payload: { id: nonEmpty },
    success: Schema.Void,
    error: StateStoreError,
  }).pipe(Authz.guard()),
);
