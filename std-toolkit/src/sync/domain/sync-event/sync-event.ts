import type { Effect } from 'effect';

export type SyncEvent =
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
  | { _tag: 'RegistryWriteFailed'; collection: string; cause: unknown };

export type SyncReporter<R = never> = (
  event: SyncEvent,
) => Effect.Effect<void, never, R>;
