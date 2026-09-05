import {
  ConditionFailure,
  conditionHolds,
  type EncodedKey,
  type ItemCondition,
} from '../../std-table/contract/index.js';
import { decodeKey } from '../item-schema/index.js';
import { nativeFailure, requestPromise } from './request.js';

export const storedConditionHolds = async (
  store: IDBObjectStore,
  key: EncodedKey,
  condition: ItemCondition | undefined,
) => {
  if (condition === undefined) return true;
  const current = (await requestPromise(store.get(decodeKey(key)))) as
    | { readonly _u: string }
    | undefined;
  return conditionHolds(condition, current);
};

export const writeFailure = (cause: unknown) =>
  cause instanceof ConditionFailure ? cause : nativeFailure(cause);
