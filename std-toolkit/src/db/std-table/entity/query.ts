import { Effect } from 'effect';
import type { EntityType } from '../../../core/index.js';
import type { AnyEntityESchema } from '../../../eschema/index.js';
import { InvalidQuery } from '../error/index.js';
import { deriveStorageKey, encodeCompositeKey } from '../key/index.js';
import {
  StdTableService,
  type JsonObject,
  type ContractFailure,
  type EncodedItem,
  type QueryPosition,
  type QueryRequest,
} from '../contract/index.js';
import type { KeyedEntityDefinition } from '../definition/index.js';
import type {
  TableEffect,
  EntityValue,
  QueryOptions,
  QueryPage,
} from './entity.js';
import { dbError, failReason } from './effects.js';
import { decode, encode, entityResult, fieldStrings } from './storage.js';

export const queryEntity = <Name extends string, S extends AnyEntityESchema>(
  definition: KeyedEntityDefinition<Name, S>,
  patternName: string,
  input: JsonObject,
  options?: QueryOptions<EntityValue<S>>,
): TableEffect<QueryPage<EntityType<EntityValue<S>>>, Name> =>
  Effect.gen(function* () {
    const pattern = Object.hasOwn(definition.accessPatterns, patternName)
      ? definition.accessPatterns[patternName]
      : undefined;
    if (pattern === undefined)
      return yield* failReason(
        new InvalidQuery({
          message: `Unknown access pattern "${patternName}"`,
        }),
      );
    const operators = [
      '=',
      '<',
      '<=',
      '>',
      '>=',
      'between',
      'beginsWith',
    ].filter((key) => key in input);
    if (operators.length !== 1)
      return yield* failReason(
        new InvalidQuery({ message: 'Exactly one sort condition is required' }),
      );
    const operator = operators[0] as
      | '='
      | '<'
      | '<='
      | '>'
      | '>='
      | 'between'
      | 'beginsWith';
    const pkValue = input.pk as JsonObject;
    const sortValue = input[operator] as
      | JsonObject
      | readonly [JsonObject, JsonObject]
      | null;
    const pk = encodeCompositeKey([
      definition.name,
      ...fieldStrings(pkValue, pattern.pk),
    ]);
    const encodeSort = (value: JsonObject) =>
      encodeCompositeKey(fieldStrings(value, pattern.sk));
    const sort =
      sortValue === null
        ? undefined
        : operator === 'between'
          ? {
              operator,
              value: [
                encodeSort((sortValue as readonly JsonObject[])[0]!),
                encodeSort((sortValue as readonly JsonObject[])[1]!),
              ] as const,
            }
          : {
              operator,
              value: encodeSort(sortValue as JsonObject),
            };
    const limit = options?.limit ?? 100;
    if (!Number.isInteger(limit) || limit <= 0)
      return yield* failReason(
        new InvalidQuery({ message: 'Limit must be a positive integer' }),
      );
    const indexSkAttribute =
      pattern.index === undefined
        ? undefined
        : pattern.kind === 'lsi'
          ? definition.table.localSecondaryIndexes[pattern.index]?.sk
          : definition.table.globalSecondaryIndexes[pattern.index]?.sk;
    const positionOf = (item: EncodedItem): QueryPosition | null => {
      if (indexSkAttribute === undefined) return { pk: item.pk, sk: item.sk };
      const indexSk = item.keys[indexSkAttribute];
      return indexSk === undefined
        ? null
        : { pk: item.pk, sk: item.sk, indexSk };
    };
    let startAfter: QueryPosition | undefined;
    if (options?.after !== undefined) {
      const encoded = yield* encode(
        definition.schema,
        options.after.value,
        definition.name,
      );
      const data: JsonObject = { ...encoded, _u: options.after.meta._u };
      const primary = deriveStorageKey(
        definition.name,
        data,
        definition.primary,
      );
      startAfter =
        pattern.index === undefined
          ? primary
          : {
              ...primary,
              indexSk: encodeCompositeKey(fieldStrings(data, pattern.sk)),
            };
    }
    const contract = (yield* StdTableService(definition.table.logicalName))
      .contract;
    const items: EntityType<EntityValue<S>>[] = [];
    let hasMore = false;
    let exhausted = false;
    while (items.length < limit && !exhausted) {
      const request: QueryRequest = {
        ...(pattern.index === undefined ? {} : { index: pattern.index }),
        pk,
        ...(sort === undefined ? {} : { sort }),
        descending: operator === '<' || operator === '<=',
        limit: Math.max(1, limit - items.length),
        ...(startAfter === undefined ? {} : { startAfter }),
      };
      const page = yield* contract
        .queryItems(request)
        .pipe(
          Effect.mapError((error) =>
            dbError('query', error as ContractFailure, definition.name),
          ),
        );
      let truncated = false;
      for (const stored of page.items) {
        if (
          stored.meta._e !== definition.name ||
          (options?.excludeDeleted && stored.meta._d)
        )
          continue;
        if (items.length === limit) {
          truncated = true;
          break;
        }
        const value = yield* decode(definition.schema, stored);
        items.push(entityResult(stored, value as EntityValue<S>));
      }
      hasMore = page.hasMore || truncated;
      exhausted = !hasMore;
      const lastItem = page.items.at(-1);
      if (lastItem === undefined) break;
      const next = positionOf(lastItem);
      if (next === null) break;
      startAfter = next;
    }
    return { items, hasMore };
  }) as TableEffect<QueryPage<EntityType<EntityValue<S>>>, Name>;
