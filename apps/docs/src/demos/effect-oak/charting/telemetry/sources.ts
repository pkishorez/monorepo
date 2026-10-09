import { Effect, Schema } from 'effect';

/*
 * The public APIs the charts read, none of which needs a key: npm's download
 * counts and registry, and GitHub's repository and commit activity. Plain
 * `fetch`, aborted if the Command asking is interrupted.
 */

const REPOSITORY = 'https://api.github.com/repos/foldkit/foldkit';

const getJson = <A>(url: string, schema: Schema.Codec<A>) =>
  Effect.tryPromise({
    try: async (signal) => {
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error(`${response.status} from ${url}`);
      return {
        status: response.status,
        body: (await response.json()) as unknown,
      };
    },
    catch: (error) => (error instanceof Error ? error.message : String(error)),
  }).pipe(
    Effect.flatMap(({ status, body }) =>
      status === 202
        ? Effect.succeed(null)
        : Schema.decodeUnknownEffect(schema)(body).pipe(
            Effect.mapError(() => `Unexpected answer from ${url}`),
          ),
    ),
  );

const Downloads = Schema.Struct({
  downloads: Schema.Array(
    Schema.Struct({ day: Schema.String, downloads: Schema.Number }),
  ),
});

const Deps = Schema.optional(Schema.Record(Schema.String, Schema.String));

const Packument = Schema.Struct({
  'dist-tags': Schema.Struct({ latest: Schema.String }),
  time: Schema.Record(Schema.String, Schema.String),
  versions: Schema.Record(
    Schema.String,
    Schema.Struct({ dependencies: Deps, peerDependencies: Deps }),
  ),
});

const Repository = Schema.Struct({
  stargazers_count: Schema.Number,
  forks_count: Schema.Number,
  open_issues_count: Schema.Number,
  subscribers_count: Schema.optional(Schema.Number),
});

const CommitActivity = Schema.Array(
  Schema.Struct({ week: Schema.Number, total: Schema.Number }),
);

export const downloads = (npmName: string) =>
  getJson(
    `https://api.npmjs.org/downloads/range/last-year/${npmName}`,
    Downloads,
  );

export const packument = (npmName: string) =>
  getJson(`https://registry.npmjs.org/${npmName}`, Packument);

export const repository = getJson(REPOSITORY, Repository);

/** GitHub answers 202 while it computes the stats: then this is null. */
export const commitActivity = getJson(
  `${REPOSITORY}/stats/commit_activity`,
  CommitActivity,
);
