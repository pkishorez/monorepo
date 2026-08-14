import {
  ConditionFailure,
  type ConditionalPut,
} from '../../std-table/contract/index.js';
import { decodeKey } from '../item-schema/index.js';
import { nativeFailure, requestPromise } from './request.js';

export const checkCondition = async (
  store: IDBObjectStore,
  request: ConditionalPut,
) => {
  const current = (await requestPromise(store.get(decodeKey(request.item)))) as
    | { readonly _u?: unknown }
    | undefined;
  if (request.condition?.kind === 'not-exists' && current !== undefined)
    throw new ConditionFailure();
  if (
    request.condition?.kind === 'updated' &&
    current?._u !== request.condition.value
  )
    throw new ConditionFailure();
};

export const writeFailure = (cause: unknown) =>
  cause instanceof ConditionFailure ? cause : nativeFailure(cause);
