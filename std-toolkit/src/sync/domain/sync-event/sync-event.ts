import type { Effect } from 'effect';

export type LeadershipState = 'waiting' | 'leading' | 'released';

export type SyncEvent =
  | {
      _tag: 'LeadershipChanged';
      collection: string;
      partitionKey: string;
      strategy: string;
      state: LeadershipState;
    }
  | {
      _tag: 'StrategyFailed';
      collection: string;
      partitionKey: string;
      strategy: string;
      cause: unknown;
    }
  | {
      _tag: 'StrategyDefect';
      collection: string;
      partitionKey: string;
      strategy: string;
      cause: unknown;
    }
  | {
      _tag: 'CadenceFailed' | 'CadenceDefect';
      collection: string;
      partitionKey: string;
      cause: unknown;
    }
  | { _tag: 'InitializationFailed'; collection: string; cause: unknown }
  | { _tag: 'UnservedQuery'; collection: string }
  | { _tag: 'RegistryDeliveryFailed'; collection: string; cause: unknown }
  | {
      _tag: 'PeerSyncFailed';
      collection: string;
      phase:
        | 'send'
        | 'channel-creation'
        | 'cleanup'
        | 'decode'
        | 'receive'
        | 'subscription';
      cause: unknown;
    };

export type SyncReporter<R = never> = (
  event: SyncEvent,
) => Effect.Effect<void, never, R>;
