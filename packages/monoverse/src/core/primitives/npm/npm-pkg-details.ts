import { Data, Effect, Schema } from 'effect';

const MaintainerSchema = Schema.Struct({
  name: Schema.String,
  email: Schema.optional(Schema.String),
});

const RepositorySchema = Schema.Struct({
  type: Schema.optional(Schema.String),
  url: Schema.optional(Schema.String),
  directory: Schema.optional(Schema.String),
});

const NpmPackageDetailsSchema = Schema.Struct({
  name: Schema.String,
  version: Schema.String,
  description: Schema.optional(Schema.String),
  license: Schema.optional(Schema.String),
  homepage: Schema.optional(Schema.String),
  repository: Schema.optional(RepositorySchema),
  maintainers: Schema.optional(Schema.Array(MaintainerSchema)),
});

export class NpmDetailsError extends Data.TaggedError('NpmDetailsError')<{
  packageName: string;
  cause: unknown;
}> {}

export class PackageDoNotExist extends Data.TaggedError('PackageDoNotExist')<{
  packageName: string;
}> {}

export interface NpmPackageDetails {
  name: string;
  version: string;
  description: string | undefined;
  license: string | undefined;
  homepage: string | undefined;
  repository: { type: string | undefined; url: string | undefined; directory: string | undefined } | undefined;
  maintainers: Array<{ name: string; email: string | undefined }>;
}

export const fetchNpmPackageDetails = (
  packageName: string,
): Effect.Effect<NpmPackageDetails, NpmDetailsError | PackageDoNotExist> =>
  Effect.gen(function* () {
    const encoded = encodeURIComponent(packageName).replace('%40', '@');

    const response = yield* Effect.tryPromise({
      try: () => fetch(`https://registry.npmjs.org/${encoded}/latest`),
      catch: (cause) => new NpmDetailsError({ packageName, cause }),
    });

    if (response.status === 404) {
      return yield* Effect.fail(new PackageDoNotExist({ packageName }));
    }

    if (!response.ok) {
      return yield* Effect.fail(
        new NpmDetailsError({ packageName, cause: new Error(`HTTP ${response.status}`) }),
      );
    }

    const json = yield* Effect.tryPromise({
      try: () => response.json(),
      catch: (cause) => new NpmDetailsError({ packageName, cause }),
    });

    const data = yield* Schema.decodeUnknown(NpmPackageDetailsSchema)(json).pipe(
      Effect.mapError((cause) => new NpmDetailsError({ packageName, cause })),
    );

    return {
      name: data.name,
      version: data.version,
      description: data.description,
      license: data.license,
      homepage: data.homepage,
      repository: data.repository
        ? {
            type: data.repository.type,
            url: data.repository.url,
            directory: data.repository.directory,
          }
        : undefined,
      maintainers: (data.maintainers ?? []).map((m) => ({ name: m.name, email: m.email })),
    };
  });
