import type { AnyEntityESchema } from '@std-toolkit/eschema';
import type { OnDemandConfig, OnDemandResult } from '../types.js';
import { CollectionTracker } from './shared.js';
import { buildPartitioned, type PartitionedOptions } from './partitioned.js';

export const buildOnDemand = <TSchema extends AnyEntityESchema>(
  tracker: CollectionTracker,
  config: OnDemandConfig<TSchema['Type'], TSchema>,
): OnDemandResult<TSchema['Type'], TSchema> => {
  type TItem = TSchema['Type'];

  const rawQueries = config.queries as Record<
    string,
    {
      query?: (value: unknown, ctx: unknown) => unknown;
      subscribe?: (value: unknown, ctx: unknown) => unknown;
    }
  >;

  const partitions = Object.fromEntries(
    Object.entries(rawQueries).map(([field, handler]) => {
      const entry: {
        query?: typeof handler.query;
        subscribe?: typeof handler.subscribe;
      } = {};
      if (handler.query !== undefined) entry.query = handler.query;
      if (handler.subscribe !== undefined) entry.subscribe = handler.subscribe;
      return [field, entry];
    }),
  ) as PartitionedOptions<TItem, TSchema>['partitions'];

  const opts: PartitionedOptions<TItem, TSchema> = {
    schema: config.schema,
    fetchOnMount: config.fetchOnMount ?? true,
    defaultPartitionKey: '',
    partitions,
  };

  if (config.cache !== undefined) opts.cache = config.cache;
  if (config.options !== undefined) opts.options = config.options;
  if (config.onInsert !== undefined) opts.onInsert = config.onInsert;
  if (config.onUpdate !== undefined) opts.onUpdate = config.onUpdate;
  if (config.onDelete !== undefined) opts.onDelete = config.onDelete;
  if (config.updateDebounceOptions !== undefined)
    opts.updateDebounceOptions = config.updateDebounceOptions;

  return buildPartitioned(tracker, opts) as unknown as OnDemandResult<
    TItem,
    TSchema
  >;
};
