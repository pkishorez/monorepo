import {
  fromReleaseKey,
  type Release,
  RELEASE_PATH,
} from '../../contract/index.js';

/*
 * Connect Cloud's Releases: what every Connection should run, which the deploy
 * names, and the files themselves. Each Release File is named by its hash, so
 * it never changes, and it is served to anyone.
 */

/** What every Connection is told: the latest Release of each Plugin, and the Minimum Connect. */
export interface Latest {
  readonly wanted: Readonly<Record<string, Release>>;
  readonly minConnect: string | null;
}

/** Where Release Files are kept: an R2 bucket, or anything that answers `get` alike, by the path it is served at. */
export interface ReleaseFiles {
  readonly get: (
    key: string,
  ) => Promise<{ readonly body: ReadableStream | null } | null>;
}

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
