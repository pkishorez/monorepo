import { Effect } from 'effect';
import {
  fromReleaseKey,
  type Release,
  RELEASE_PATH,
  releaseKey,
  type ReleaseStanding,
} from '../../contract/index.js';

/*
 * Connect Cloud's Releases: what every Connection should run, which the deploy
 * names, where any Release stands, and the files themselves. Each Release File
 * is named by its hash, so it never changes, and it is served to anyone. A Stage
 * only ever keeps the Release it names, and never takes one away, so a file kept
 * that it does not name is an older Release.
 */

/** What every Connection is told: the latest Release of each Plugin, and the Minimum Connect. */
export interface Latest {
  readonly wanted: Readonly<Record<string, Release>>;
  readonly minConnect: string | null;
}

/** Where Release Files are kept: an R2 bucket, or anything that answers `get` and `head` alike, by the path it is served at. */
export interface ReleaseFiles {
  readonly get: (
    key: string,
  ) => Promise<{ readonly body: ReadableStream | null } | null>;
  /** Something when a file is at `key`; null when none is. */
  readonly head: (key: string) => Promise<unknown>;
}

/**
 * Where the Release `hash` of the Plugin `plugin` stands: `Latest` when `wanted`
 * names it, `Older` when `files` keeps its file, else `Unknown`, as is a name or
 * hash no file could have, and with `files` absent or failing to answer.
 */
export const standingOf = (
  wanted: Latest['wanted'],
  files: ReleaseFiles | undefined,
  plugin: string,
  hash: string,
): Effect.Effect<ReleaseStanding> => {
  if (Object.hasOwn(wanted, plugin) && wanted[plugin]?.hash === hash)
    return Effect.succeed({ _tag: 'Latest' });
  const key = releaseKey(plugin, hash);
  if (files === undefined || fromReleaseKey(key) === null)
    return Effect.succeed({ _tag: 'Unknown' });
  return Effect.tryPromise(() =>
    files.head(`${RELEASE_PATH.slice(1)}/${key}`),
  ).pipe(
    Effect.map((found): ReleaseStanding => ({
      _tag: found === null ? 'Unknown' : 'Older',
    })),
    Effect.orElseSucceed((): ReleaseStanding => ({ _tag: 'Unknown' })),
  );
};

/** A Release File never changes: its name is its hash. */
const IMMUTABLE = 'public, max-age=31536000, immutable';

/** Answers `GET /releases/<name>/<sha256>.mjs` from `files`; 404 for anything else. */
export const releaseFile = async (
  pathname: string,
  files: ReleaseFiles | undefined,
): Promise<Response> => {
  const notFound = () => new Response('Not found', { status: 404 });
  const key = pathname.slice(RELEASE_PATH.length + 1);
  if (files === undefined || fromReleaseKey(key) === null) return notFound();
  const found = await files.get(pathname.slice(1));
  if (found === null || found.body === null) return notFound();
  return new Response(found.body, {
    headers: {
      'content-type': 'text/javascript; charset=utf-8',
      'cache-control': IMMUTABLE,
      'access-control-allow-origin': '*',
    },
  });
};
