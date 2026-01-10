import { Data, Effect, Schema } from 'effect';

const NpmDownloadsSchema = Schema.Struct({
  downloads: Schema.Number,
  start: Schema.String,
  end: Schema.String,
  package: Schema.String,
});

export class NpmDownloadsError extends Data.TaggedError('NpmDownloadsError')<{
  packageName: string;
  cause: unknown;
}> {}

export class PackageDoNotExist extends Data.TaggedError('PackageDoNotExist')<{
  packageName: string;
}> {}

export interface NpmDownloads {
  package: string;
  downloads: number;
  start: string;
  end: string;
}

export type DownloadPeriod = 'last-day' | 'last-week' | 'last-month';

export const fetchNpmDownloads = (
  packageName: string,
  period: DownloadPeriod = 'last-week',
): Effect.Effect<NpmDownloads, NpmDownloadsError | PackageDoNotExist> =>
  Effect.gen(function* () {
    const encoded = encodeURIComponent(packageName).replace('%40', '@');

    const response = yield* Effect.tryPromise({
      try: () => fetch(`https://api.npmjs.org/downloads/point/${period}/${encoded}`),
      catch: (cause) => new NpmDownloadsError({ packageName, cause }),
    });

    if (response.status === 404) {
      return yield* Effect.fail(new PackageDoNotExist({ packageName }));
    }

    if (!response.ok) {
      return yield* Effect.fail(
        new NpmDownloadsError({ packageName, cause: new Error(`HTTP ${response.status}`) }),
      );
    }

    const json = yield* Effect.tryPromise({
      try: () => response.json(),
      catch: (cause) => new NpmDownloadsError({ packageName, cause }),
    });

    const data = yield* Schema.decodeUnknown(NpmDownloadsSchema)(json).pipe(
      Effect.mapError((cause) => new NpmDownloadsError({ packageName, cause })),
    );

    return {
      package: data.package,
      downloads: data.downloads,
      start: data.start,
      end: data.end,
    };
  });
