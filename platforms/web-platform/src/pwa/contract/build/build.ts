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
  url: Schema.String.check(Schema.isStartingWith('/')),
  revision: Schema.NonEmptyString,
});
export type PrecacheEntry = typeof PrecacheEntry.Type;

export const PrecacheList = Schema.Array(PrecacheEntry);
export type PrecacheList = typeof PrecacheList.Type;

/** Meta tag the page reads its Build ID from: `<meta name=… content=buildId>`. */
export const BUILD_ID_META_NAME = 'web-platform:build-id';
/** Meta tag with the time the build ran, as an ISO 8601 string. */
export const BUILT_AT_META_NAME = 'web-platform:built-at';
/** Meta tag with the git commit the build came from. */
export const COMMIT_META_NAME = 'web-platform:commit';

/** Virtual module the plugin serves to the service worker bundle. */
export const VIRTUAL_BUILD_MODULE_ID = 'virtual:web-platform/pwa/build';
/** Virtual module the plugin serves to the client and ssr environments. */
export const VIRTUAL_CLIENT_MODULE_ID = 'virtual:web-platform/pwa/client';

export const MANIFEST_URL = '/manifest.webmanifest';

/** Every cache the PWA owns starts with this; the Kill Switch deletes them all. */
export const CACHE_PREFIX = 'web-platform:pwa:';
/**
 * What the caches started with when this was `@kestack/pwa-toolkit`.
 * Installed apps still hold some: a version deletes them as it activates,
 * and so does whatever deletes the PWA's caches.
 */
export const FORMER_CACHE_PREFIX = 'pwa-toolkit:';
const PRECACHE_PREFIX = `${CACHE_PREFIX}precache:`;
const RUNTIME_PREFIX = `${CACHE_PREFIX}runtime:`;

/** Per-build Precache; old builds' caches are deleted on activate. */
export const precacheCacheName = (buildId: BuildId): string =>
  `${PRECACHE_PREFIX}${buildId}`;

/** Runtime Cache for a rule's `cacheName`; survives updates. */
export const runtimeCacheName = (cacheName: string): string =>
  `${RUNTIME_PREFIX}${cacheName}`;

/** A cache of the PWA's, under its name today or its former one. */
export const isPwaCacheName = (name: string): boolean =>
  name.startsWith(CACHE_PREFIX) || isFormerCacheName(name);
export const isFormerCacheName = (name: string): boolean =>
  name.startsWith(FORMER_CACHE_PREFIX);
export const isPrecacheCacheName = (name: string): boolean =>
  name.startsWith(PRECACHE_PREFIX);
/** A Runtime Cache, under the PWA's name today or its former one: clearing them on sign-out must reach both. */
export const isRuntimeCacheName = (name: string): boolean =>
  name.startsWith(RUNTIME_PREFIX) ||
  name.startsWith(`${FORMER_CACHE_PREFIX}runtime:`);

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
