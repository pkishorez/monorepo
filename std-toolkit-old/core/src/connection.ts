import { Context } from 'effect';
import { broadcastSchema } from './schema.js';
import stringify from 'json-stringify-deterministic';

export const stringifyObj = stringify;
export type SubscriptionType = {
  value?: Record<string, any>;
  meta: {
    _e: string;
  } & Partial<(typeof broadcastSchema.Type)['meta']>;
};
export class ConnectionService extends Context.Tag('std-toolkit/subscription')<
  ConnectionService,
  {
    connectionId: string;
    subscribe: (value: SubscriptionType) => void;
    unsubscribe: (value: SubscriptionType) => void;
  }
>() {}

const isSubsetMatch = (
  subset: Record<string, any>,
  obj: Record<string, any>,
) => {
  return Object.entries(subset).every(([key, value]) => obj[key] === value);
};

export const isSubscriptionEqual = (
  subscriptionA: SubscriptionType,
  subscriptionB: SubscriptionType,
) => {
  return stringifyObj(subscriptionA) === stringify(subscriptionB);
};

export const matchesBroadcast = (
  subscription: SubscriptionType,
  broadcast: typeof broadcastSchema.Type,
) => {
  return (
    isSubsetMatch(subscription.meta, broadcast.meta) &&
    isSubsetMatch(subscription.value ?? {}, broadcast.value)
  );
};
