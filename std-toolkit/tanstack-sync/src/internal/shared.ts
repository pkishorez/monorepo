import { Effect, Option } from 'effect';
import type {
  ChangeMessageOrDeleteKeyMessage,
  SyncConfig,
} from '@tanstack/react-db';
import type { EntityType } from '@std-toolkit/core';
import type { CacheEntity, CacheStore } from '@std-toolkit/cache';
import { MemoryCache } from '@std-toolkit/cache/memory';
import type { AnyEntityESchema } from '@std-toolkit/eschema';
import type { CollectionItem, CollectionRef, UpdatePayload } from '../types.js';

export type SyncCallbacks<TCollItem extends object> = Parameters<
  SyncConfig<TCollItem, string>['sync']
>[0];

export const resolveCache = (cache: CacheStore | undefined): CacheStore =>
  cache ?? new MemoryCache();

export const getItemId = <T extends object>(item: T, idField: string): string =>
  String((item as Record<string, unknown>)[idField]);

export const stripMeta = <TItem extends object>(
  item: CollectionItem<TItem>,
): TItem => {
  const { _meta, ...value } = item;
  return value as TItem;
};

export const stripMetaPartial = <TItem extends object>(
  item: Partial<CollectionItem<TItem>>,
): Partial<TItem> => {
  const { _meta, ...value } = item;
  return value as Partial<TItem>;
};

export const toCollectionItem = <TItem extends object>(
  entity: EntityType<TItem>,
): CollectionItem<TItem> =>
  ({ ...entity.value, _meta: entity.meta }) as CollectionItem<TItem>;

export const buildUpdatePayload = <
  TItem extends object,
  TSchema extends AnyEntityESchema,
>(
  schema: TSchema,
  key: string,
  updates: Partial<TItem>,
): UpdatePayload<TItem, TSchema> =>
  ({ [schema.idField]: key, updates }) as unknown as UpdatePayload<
    TItem,
    TSchema
  >;

const isNewerTimestamp = (existingU: string, incomingU: string): boolean =>
  !existingU || !incomingU || incomingU > existingU;

export const shouldApplyEntity = <TItem extends object>(
  existing: CollectionItem<TItem> | undefined,
  incoming: EntityType<TItem>,
): boolean => {
  if (!existing) return true;
  return isNewerTimestamp(existing._meta?._u ?? '', incoming.meta._u ?? '');
};

export const toChangeMessages = <TItem extends object>(
  callbacks: SyncCallbacks<CollectionItem<TItem>>,
  entities: EntityType<TItem>[],
): ChangeMessageOrDeleteKeyMessage<CollectionItem<TItem>, string>[] => {
  const messages: ChangeMessageOrDeleteKeyMessage<
    CollectionItem<TItem>,
    string
  >[] = [];

  for (const entity of entities) {
    const value = toCollectionItem(entity);
    const key = String(callbacks.collection.getKeyFromItem(value));
    const existing = callbacks.collection.get(key) as
      | CollectionItem<TItem>
      | undefined;

    if (!shouldApplyEntity(existing, entity)) continue;

    if (entity.meta._d) {
      if (callbacks.collection.has(key)) messages.push({ type: 'delete', key });
      continue;
    }

    messages.push({
      type: callbacks.collection.has(key) ? 'update' : 'insert',
      value,
    });
  }

  return messages;
};

export const writeEntitiesToCollection = <TItem extends object>(
  callbacks: SyncCallbacks<CollectionItem<TItem>> | null,
  entities: EntityType<TItem>[],
  options?: { immediate?: boolean },
): void => {
  if (!callbacks || entities.length === 0) return;

  const messages = toChangeMessages(callbacks, entities);
  if (messages.length === 0) return;

  callbacks.begin(options);
  for (const message of messages) callbacks.write(message);
  callbacks.commit();
};

export const writeKeysToCollection = <TItem extends object>(
  callbacks: SyncCallbacks<CollectionItem<TItem>> | null,
  keys: string[],
  options?: { immediate?: boolean },
): void => {
  if (!callbacks || keys.length === 0) return;

  const messages = keys
    .filter((key) => callbacks.collection.has(key))
    .map((key) => ({ type: 'delete' as const, key }));

  if (messages.length === 0) return;

  callbacks.begin(options);
  for (const message of messages) callbacks.write(message);
  callbacks.commit();
};

export const cacheEntities = <TItem extends object>(
  cache: CacheEntity<TItem>,
  schema: AnyEntityESchema,
  items: EntityType<TItem>[],
) =>
  Effect.forEach(
    items,
    (item) =>
      Effect.gen(function* () {
        const id = getItemId(item.value, schema.idField);
        const existing = yield* cache.get(id);
        const existingU = Option.map(existing, (e) => e.meta._u ?? '').pipe(
          Option.getOrElse(() => ''),
        );
        if (isNewerTimestamp(existingU, item.meta._u ?? '')) {
          yield* cache.put(item);
        }
      }),
    { discard: true },
  );

export class CollectionTracker {
  #byName = new Map<string, CollectionRef>();

  register(ref: CollectionRef) {
    this.#byName.set(ref.utils.schema().name, ref);
  }

  getByName(name: string): CollectionRef | undefined {
    return this.#byName.get(name);
  }
}
