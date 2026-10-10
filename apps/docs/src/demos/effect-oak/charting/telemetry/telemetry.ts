import { Context, Effect, Layer, Schema } from 'effect';
import { commitActivity, downloads, packument, repository } from './sources.js';
import { WEEKS, weekIndex, weekStarts } from './weeks.js';

/*
 * Foldkit's numbers, as one Telemetry: its repository, its four packages with
 * their downloads by week and how they depend on each other, and commits and
 * releases by week. Fetched by the Telemetry Service, whose Layer reads npm
 * and GitHub.
 */

export const PACKAGES = [
  { id: 'Core', npmName: 'foldkit' },
  { id: 'Ui', npmName: '@foldkit/ui' },
  { id: 'Devtools', npmName: '@foldkit/devtools' },
  { id: 'VitePlugin', npmName: '@foldkit/vite-plugin' },
] as const;

const PackageId = Schema.Literals(['Core', 'Ui', 'Devtools', 'VitePlugin']);

export const TelemetryData = Schema.Struct({
  fetchedAt: Schema.Number,
  repository: Schema.Struct({
    stars: Schema.Number,
    forks: Schema.Number,
    openIssues: Schema.Number,
  }),
  packages: Schema.Array(
    Schema.Struct({
      id: PackageId,
      npmName: Schema.String,
      latestVersion: Schema.String,
      totalDownloads: Schema.Number,
      downloadsByWeek: Schema.Array(Schema.Number),
    }),
  ),
  edges: Schema.Array(
    Schema.Struct({
      source: PackageId,
      target: PackageId,
      kind: Schema.Literals(['Dependency', 'PeerDependency']),
    }),
  ),
  weeks: Schema.Array(
    Schema.Struct({
      weekStart: Schema.String,
      commits: Schema.Number,
      releases: Schema.Number,
    }),
  ),
  warnings: Schema.Array(Schema.String),
});
type TelemetryData = typeof TelemetryData.Type;

export class Telemetry extends Context.Service<
  Telemetry,
  { readonly fetch: Effect.Effect<TelemetryData, string> }
>()('docs/charting/Telemetry') {}

const byWeek = (
  now: number,
  items: ReadonlyArray<readonly [time: number, count: number]>,
) => {
  const counts = Array.from({ length: WEEKS }, () => 0);
  for (const [time, count] of items) {
    const index = weekIndex(now, time);
    if (index !== null) counts[index]! += count;
  }
  return counts;
};

const fetchTelemetry = Effect.gen(function* () {
  const now = Date.now();
  const [repo, activity, packages] = yield* Effect.all(
    [
      repository,
      commitActivity,
      Effect.forEach(
        PACKAGES,
        (spec) =>
          Effect.all([downloads(spec.npmName), packument(spec.npmName)]).pipe(
            Effect.map(([counts, doc]) => ({ spec, counts, doc })),
          ),
        { concurrency: 'unbounded' },
      ),
    ],
    { concurrency: 'unbounded' },
  );

  const releases = byWeek(
    now,
    packages.flatMap(({ doc }) =>
      Object.entries(doc?.time ?? {})
        .filter(([version]) => version !== 'created' && version !== 'modified')
        .map(([, at]) => [Date.parse(at), 1] as const),
    ),
  );
  const commits = byWeek(
    now,
    (activity ?? []).map(({ week, total }) => [week * 1000, total] as const),
  );

  return {
    fetchedAt: now,
    repository: {
      stars: repo?.stargazers_count ?? 0,
      forks: repo?.forks_count ?? 0,
      openIssues: repo?.open_issues_count ?? 0,
    },
    packages: packages.map(({ spec, counts, doc }) => {
      const days = counts?.downloads ?? [];
      return {
        id: spec.id,
        npmName: spec.npmName,
        latestVersion: doc?.['dist-tags'].latest ?? 'unknown',
        totalDownloads: days.reduce((sum, day) => sum + day.downloads, 0),
        downloadsByWeek: byWeek(
          now,
          days.map((day) => [Date.parse(day.day), day.downloads] as const),
        ),
      };
    }),
    edges: packages.flatMap(({ spec, doc }) => {
      const latest = doc?.versions[doc['dist-tags'].latest];
      const kinds = [
        ['Dependency', latest?.dependencies],
        ['PeerDependency', latest?.peerDependencies],
      ] as const;
      return kinds.flatMap(([kind, deps]) =>
        PACKAGES.filter((target) => deps?.[target.npmName] !== undefined).map(
          (target) => ({ source: spec.id, target: target.id, kind }),
        ),
      );
    }),
    weeks: weekStarts(now).map((weekStart, i) => ({
      weekStart,
      commits: commits[i]!,
      releases: releases[i]!,
    })),
    warnings:
      activity === null
        ? ['GitHub is still computing commit activity; try Refresh soon.']
        : [],
  } satisfies TelemetryData;
});

export const NpmAndGitHub = Layer.succeed(Telemetry, { fetch: fetchTelemetry });
