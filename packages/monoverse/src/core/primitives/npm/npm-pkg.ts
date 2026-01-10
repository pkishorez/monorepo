import { Data, Effect, Schema } from 'effect';

const NpmPackageSchema = Schema.Struct({
  'name': Schema.String,
  'modified': Schema.String,
  'dist-tags': Schema.Record({ key: Schema.String, value: Schema.String }),
  'versions': Schema.Record({
    key: Schema.String,
    value: Schema.Struct({ version: Schema.String }),
  }),
});

export class NpmError extends Data.TaggedError('NpmError')<{
  packageName: string;
  cause: unknown;
}> {}

export class PackageDoNotExist extends Data.TaggedError('PackageDoNotExist')<{
  packageName: string;
}> {}

export interface NpmPackageInfo {
  name: string;
  latestVersion: string;
  modified: string;
  versions: string[];
  distTags: Record<string, string>;
}

export const fetchNpmPackage = (
  packageName: string,
): Effect.Effect<NpmPackageInfo, NpmError | PackageDoNotExist> =>
  Effect.gen(function* () {
    const encoded = encodeURIComponent(packageName).replace('%40', '@');

    const response = yield* Effect.tryPromise({
      try: () =>
        fetch(`https://registry.npmjs.org/${encoded}`, {
          headers: { Accept: 'application/vnd.npm.install-v1+json' },
        }),
      catch: (cause) => new NpmError({ packageName, cause }),
    });

    if (response.status === 404) {
      return yield* Effect.fail(new PackageDoNotExist({ packageName }));
    }

    if (!response.ok) {
      return yield* Effect.fail(
        new NpmError({
          packageName,
          cause: new Error(`HTTP ${response.status}`),
        }),
      );
    }

    const json = yield* Effect.tryPromise({
      try: () => response.json(),
      catch: (cause) => new NpmError({ packageName, cause }),
    });

    const data = yield* Schema.decodeUnknown(NpmPackageSchema)(json).pipe(
      Effect.mapError((cause) => new NpmError({ packageName, cause })),
    );

    return {
      name: data.name,
      latestVersion:
        data['dist-tags'].latest ?? Object.keys(data.versions).pop() ?? '',
      modified: data.modified,
      versions: Object.keys(data.versions),
      distTags: data['dist-tags'],
    };
  });
