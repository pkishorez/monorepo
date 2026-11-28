import { Context, Data, type Duration, type Effect } from 'effect';

export interface Progress {
  readonly received: number;
  readonly total: number | null;
}

export interface Download {
  readonly url: string;
  readonly sha256: string;
  readonly name?: string;
}

export interface Made<E> {
  readonly key: string;
  readonly name?: string;
  readonly produce: (file: string) => Effect.Effect<void, E>;
}

export class DownloadFailed extends Data.TaggedError('DownloadFailed')<{
  readonly url: string;
  readonly message: string;
  readonly missing: boolean;
}> {}

export class HashMismatch extends Data.TaggedError('HashMismatch')<{
  readonly url: string;
  readonly expected: string;
  readonly actual: string;
}> {}

export class CacheError extends Data.TaggedError('CacheError')<{
  readonly path: string;
  readonly message: string;
}> {}

export class Downloads extends Context.Service<
  Downloads,
  {
    readonly fetch: (
      download: Download,
      onProgress?: (progress: Progress) => Effect.Effect<void>,
    ) => Effect.Effect<string, DownloadFailed | HashMismatch | CacheError>;
    readonly ensure: <E>(
      made: Made<E>,
    ) => Effect.Effect<string, E | CacheError>;
    readonly use: (key: string) => Effect.Effect<void, CacheError>;
    readonly prune: (options: {
      readonly olderThan: Duration.Input;
      readonly keep?: ReadonlyArray<string>;
    }) => Effect.Effect<ReadonlyArray<string>, CacheError>;
  }
>()('Connect/service/Downloads') {}
