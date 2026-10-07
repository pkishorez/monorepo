import type { Effect } from 'effect';

export type SyncEvent =
  | {
      _tag: 'SessionFailed';
      collection: string;
      windowKey: string;
      strategy: string;
      cause: unknown;
    }
  | {
      _tag: 'OutdatedApplication';
      collection: string;
      version: string;
      latestVersion: string;
    }
  | { _tag: 'StoreClosed'; sync: string };

export type SyncReporter<R = never> = (
  event: SyncEvent,
) => Effect.Effect<void, never, R>;
