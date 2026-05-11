import type { AnyEntityESchema } from '@std-toolkit/eschema';
import type {
  StdCollectionUtils,
  TotalSyncConfig,
  TotalSyncResult,
} from '../types.js';
import { CollectionTracker } from './shared.js';
import { buildPartitioned, type PartitionedOptions } from './partitioned.js';

export const buildTotalSync = <TSchema extends AnyEntityESchema>(
  tracker: CollectionTracker,
  config: TotalSyncConfig<TSchema['Type'], TSchema>,
): TotalSyncResult<TSchema['Type'], TSchema> => {
  type TItem = TSchema['Type'];

  const opts: PartitionedOptions<TItem, TSchema> = {
    schema: config.schema,
    fetchOnMount: config.fetchOnMount ?? true,
    defaultPartitionKey: '',
    partitions: {},
    singletonQuery: {
      query: (ctx) => config.query(ctx),
      ...(config.subscribe && {
        subscribe: (ctx) => config.subscribe!(ctx),
      }),
    },
  };

  if (config.cache !== undefined) opts.cache = config.cache;
  if (config.onInsert !== undefined) opts.onInsert = config.onInsert;
  if (config.onUpdate !== undefined) opts.onUpdate = config.onUpdate;
  if (config.onDelete !== undefined) opts.onDelete = config.onDelete;

  const inner = buildPartitioned(tracker, opts);

  const utils: StdCollectionUtils<TItem, TSchema> = {
    upsert: inner.utils.upsert,
    remove: inner.utils.remove,
    schema: inner.utils.schema,
    fetchMore: () => inner.utils.fetchMore({}),
  };

  return {
    ...inner,
    utils,
  } as TotalSyncResult<TItem, TSchema>;
};
