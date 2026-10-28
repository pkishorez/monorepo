import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Data, Effect, Schema } from 'effect';

/*
 * The Release Log of each Plugin: `src/plugins/<name>/releases.json`, kept
 * in git, every Release of the Plugin in order, the latest last. Each is
 * the sha256 of the Plugin's file and one line on what changed; nothing
 * else, so which `ke-connect` may run it is the Minimum Connect's alone.
 * Every change to the file is a new Release: `pnpm release:plugin <name>
 * "<summary>"` builds it and appends its hash, and refuses a build already
 * in the Log. A deployed Stage names the latest, and refuses to deploy a
 * build that is not it.
 */

/** One Release: the sha256 of the Plugin's file, in hex, and what changed. */
const Release = Schema.Struct({
  hash: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)),
  summary: Schema.NonEmptyString,
});
export type Release = typeof Release.Type;

/** A Plugin's Release Log. */
const ReleaseLog = Schema.Struct({
  plugin: Schema.String,
  releases: Schema.Array(Release),
});
export type ReleaseLog = typeof ReleaseLog.Type;

/** This package's folder, apps/connect. */
const root = (path: string) =>
  fileURLToPath(new URL(`../../../${path}`, import.meta.url));

/** Where the Release Log of the Plugin `name` is kept. */
export const logFile = (name: string) =>
  root(`src/plugins/${name}/releases.json`);

/** The Plugin `name` as `pnpm build:plugin` builds it. */
export const bundleFile = (name: string) => root(`dist/plugin/${name}.mjs`);

/** The sha256 of `bytes`, in hex. */
export const sha256 = (bytes: Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');

/** The hash of the file at `file`; null when there is none. */
export const builtHash = (file: string): string | null =>
  existsSync(file) ? sha256(readFileSync(file)) : null;

/** The Release Log at `file`; fails when it is missing or not one. */
export const readLog = (file: string) =>
  Effect.try({
    try: () => JSON.parse(readFileSync(file, 'utf8')) as unknown,
    catch: (cause) => new Error(`No Release Log at ${file}`, { cause }),
  }).pipe(
    Effect.flatMap((json) =>
      Effect.mapError(
        Schema.decodeUnknownEffect(ReleaseLog)(json),
        (cause) => new Error(`${file} is not a Release Log`, { cause }),
      ),
    ),
  );

/** Writes `log` to `file`, as a person reads it. */
export const writeLog = (file: string, log: ReleaseLog) =>
  Effect.sync(() =>
    writeFileSync(file, `${JSON.stringify(log, null, 2)}\n`, 'utf8'),
  );

/** A build that is not the latest Release of its Plugin. */
export class NotLatest extends Data.TaggedError('NotLatest')<{
  readonly plugin: string;
  readonly hash: string;
  /** Whether it is an earlier Release; else it is in the Log not at all. */
  readonly earlier: boolean;
}> {
  override get message() {
    return this.earlier
      ? `This build of the ${this.plugin} Plugin, ${this.hash}, is older than its latest Release: build from the latest code`
      : `The ${this.plugin} Plugin changed: its build, ${this.hash}, is no Release. Run \`pnpm release:plugin ${this.plugin} "<what changed>"\` and commit releases.json`;
  }
}

/** The latest Release in `log`, when the build `hash` is it; fails NotLatest when it is not. */
export const checkBuild = (log: ReleaseLog, hash: string) => {
  const latest = log.releases.at(-1);
  return latest?.hash === hash
    ? Effect.succeed(latest)
    : Effect.fail(
        new NotLatest({
          plugin: log.plugin,
          hash,
          earlier: log.releases.some((each) => each.hash === hash),
        }),
      );
};

/** A build already in its Release Log. */
export class AlreadyReleased extends Data.TaggedError('AlreadyReleased')<{
  readonly plugin: string;
  readonly hash: string;
}> {
  override get message() {
    return `This build of the ${this.plugin} Plugin, ${this.hash}, is a Release already: nothing changed`;
  }
}

/** `log` with `release` its latest; fails AlreadyReleased when its hash is in it. */
export const appendRelease = (log: ReleaseLog, release: Release) =>
  log.releases.some((each) => each.hash === release.hash)
    ? Effect.fail(
        new AlreadyReleased({ plugin: log.plugin, hash: release.hash }),
      )
    : Effect.succeed({ ...log, releases: [...log.releases, release] });
