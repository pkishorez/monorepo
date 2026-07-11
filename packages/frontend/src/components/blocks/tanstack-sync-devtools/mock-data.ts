import type {
  InspectorCollection,
  InspectorPartition,
} from 'std-toolkit/tanstack-sync';

export const mockCollections: InspectorCollection[] = [
  {
    id: 'Campaign',
    collectionName: 'Campaign',
    kind: 'keyed',
    status: 'ready',
    itemCount: 42,
    subscriberCount: 2,
    partitionFields: [],
  },
  {
    id: 'Voucher',
    collectionName: 'Voucher',
    kind: 'partitioned',
    status: 'ready',
    itemCount: 318,
    subscriberCount: 3,
    partitionFields: ['campaignId', 'code', 'prefix'],
  },
  {
    id: 'Settings',
    collectionName: 'Settings',
    kind: 'single-item',
    status: 'ready',
    itemCount: 1,
    subscriberCount: 1,
    partitionFields: [],
  },
];

export const mockPartitions: InspectorPartition[] = [
  {
    id: 'Voucher:campaignId="camp_summer"',
    collectionName: 'Voucher',
    partitionField: 'campaignId',
    partitionValue: 'camp_summer',
    partitionKey: 'campaignId="camp_summer"',
    partitionKind: 'partition',
    activity: 'active',
    itemCount: 120,
    subscriberCount: 2,
    strategyState: {
      strategy: 'bidirectional',
      slices: [{ low: 'v_100', high: 'v_220', itemCount: 120 }],
    },
  },
  {
    id: 'Voucher:campaignId="camp_winter"',
    collectionName: 'Voucher',
    partitionField: 'campaignId',
    partitionValue: 'camp_winter',
    partitionKey: 'campaignId="camp_winter"',
    partitionKind: 'partition',
    activity: 'cached',
    itemCount: 64,
    subscriberCount: 0,
    strategyState: {
      strategy: 'bidirectional',
      slices: [{ low: 'v_300', high: 'v_364', itemCount: 64 }],
    },
  },
  {
    id: 'Voucher:prefix="SUM"',
    collectionName: 'Voucher',
    partitionField: 'prefix',
    partitionValue: 'SUM',
    partitionKey: 'prefix="SUM"',
    partitionKind: 'partition',
    activity: 'active',
    itemCount: 20,
    subscriberCount: 1,
    strategyState: { strategy: 'oldToNew', cursor: { meta: { _u: 'cur_20' } } },
  },
];
