import * as Schema from 'effect/Schema';
import { canonicalJson } from './canonical-json.js';
import { fnv1a64 } from './fnv1a.js';

/** The identity of one build of the app. */
export const BuildId = Schema.NonEmptyString.pipe(Schema.brand('BuildId'));
export type BuildId = typeof BuildId.Type;

/**
 * One URL saved when a version installs. `url` is origin-relative
 * (`/assets/app-3f9a.js`); `revision` is a content hash of the file.
 */
export const PrecacheEntry = Schema.Struct({
  url: Schema.String.check(Schema.isStartsWith('/')),
  revision: Schema.NonEmptyString,
});
export type PrecacheEntry = typeof PrecacheEntry.Type;

export const PrecacheList = Schema.Array(PrecacheEntry);
export type PrecacheList = typeof PrecacheList.Type;

/** Meta tag the page reads its Build ID from: `<meta name=… content=buildId>`. */
export const BUILD_ID_META_NAME = 'pwa-toolkit:build-id';
/** Meta tag with the time the build ran, as an ISO 8601 string. */
export const BUILT_AT_META_NAME = 'pwa-toolkit:built-at';
/** Meta tag with the git commit the build came from. */
export const COMMIT_META_NAME = 'pwa-toolkit:commit';

/** Virtual module the plugin serves to the service worker bundle. */
export const VIRTUAL_BUILD_MODULE_ID = 'virtual:pwa-toolkit/build';
/** Virtual module the plugin serves to the client and ssr environments. */
export const VIRTUAL_CLIENT_MODULE_ID = 'virtual:pwa-toolkit/client';

export const MANIFEST_URL = '/manifest.webmanifest';

/** Every cache the toolkit owns starts with this; the Kill Switch deletes them all. */
export const CACHE_PREFIX = 'pwa-toolkit:';
const PRECACHE_PREFIX = `${CACHE_PREFIX}precache:`;
const RUNTIME_PREFIX = `${CACHE_PREFIX}runtime:`;

/** Per-build Precache; old builds' caches are deleted on activate. */
export const precacheCacheName = (buildId: BuildId): string =>
  `${PRECACHE_PREFIX}${buildId}`;

/** Runtime Cache for a rule's `cacheName`; survives updates. */
export const runtimeCacheName = (cacheName: string): string =>
  `${RUNTIME_PREFIX}${cacheName}`;

/**
 * Runtime Cache for navigations when `navigation.cachePages` is on. Saved
 * pages point at their build's hashed assets, so the cache belongs to one
 * build and is deleted when another activates.
 */
export const pagesCacheName = (buildId: BuildId): string =>
  runtimeCacheName(`pages:${buildId}`);

export const isToolkitCacheName = (name: string): boolean =>
  name.startsWith(CACHE_PREFIX);
export const isPrecacheCacheName = (name: string): boolean =>
  name.startsWith(PRECACHE_PREFIX);
export const isRuntimeCacheName = (name: string): boolean =>
  name.startsWith(RUNTIME_PREFIX);

/**
 * Build ID from the Precache list and the worker config. Entry order does not
 * matter; the same inputs give the same ID in node and in the browser.
 */
export const computeBuildId = (input: {
  readonly precache: PrecacheList;
  readonly config: unknown;
}): BuildId => {
  const entries = input.precache
    .map((entry) => `${entry.url}\u0000${entry.revision}`)
    .sort();
  return BuildId.make(
    fnv1a64(`${entries.join('\n')}\u0001${canonicalJson(input.config)}`),
  );
};
