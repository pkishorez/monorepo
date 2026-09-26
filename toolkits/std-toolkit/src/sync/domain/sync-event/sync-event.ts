import type { Effect } from 'effect';

export type SyncEvent =
  | {
      _tag: 'SessionFailed';
      collection: string;
      partitionKey: string;
      strategy: string;
      cause: unknown;
    }
  | {
      _tag: 'OutdatedApplication';
      collection: string;
      version: string;
      latestVersion: string;
    }
  | { _tag: 'PlatformClosed'; sync: string };

export type SyncReporter<R = never> = (
  event: SyncEvent,
) => Effect.Effect<void, never, R>;
