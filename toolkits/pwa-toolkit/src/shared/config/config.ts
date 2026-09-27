import * as Schema from 'effect/Schema';
import { BuildId, PrecacheList } from '../build/index.js';
import { WebAppManifest } from '../manifest/index.js';
import { StrategyRule } from '../strategy/index.js';
import { PRESET_NAMES, PRESETS } from './presets.js';

const Path = Schema.String.check(Schema.isStartsWith('/'));
const PositiveInt = Schema.Int.check(Schema.isGreaterThan(0));

/** How navigations resolve: network, then App Shell, then Offline Fallback. */
export const NavigationConfig = Schema.Struct({
  shell: Schema.Boolean,
  shellPath: Path,
  offlineFallback: Path,
  networkTimeoutMs: PositiveInt,
  cachePages: Schema.Boolean,
  /** Path prefixes whose navigations the worker never handles. */
  denylist: Schema.Array(Path),
});
export type NavigationConfig = typeof NavigationConfig.Type;

/** The page never reloads unasked; it only checks for a newer build this often. */
export const UpdateConfig = Schema.Struct({
  checkIntervalMinutes: PositiveInt,
});
export type UpdateConfig = typeof UpdateConfig.Type;

/** `include` and `exclude` are globs relative to the client outDir. */
const PrecacheConfig = Schema.Struct({
  include: Schema.Array(Schema.String),
  exclude: Schema.Array(Schema.String),
  warnAboveBytes: PositiveInt,
});

/** Options to `pwa({...})`. Everything is optional; see `resolvePwaConfig`. */
export const PwaOptions = Schema.Struct({
  enabled: Schema.optionalKey(Schema.Boolean),
  dev: Schema.optionalKey(Schema.Boolean),
  preset: Schema.optionalKey(Schema.Literals(PRESET_NAMES)),
  manifest: Schema.optionalKey(WebAppManifest),
  precache: Schema.optionalKey(
    PrecacheConfig.mapFields((f) => ({
      include: Schema.optionalKey(f.include),
      exclude: Schema.optionalKey(f.exclude),
      warnAboveBytes: Schema.optionalKey(f.warnAboveBytes),
    })),
  ),
  strategies: Schema.optionalKey(Schema.Array(StrategyRule)),
  navigation: Schema.optionalKey(
    NavigationConfig.mapFields((f) => ({
      shell: Schema.optionalKey(f.shell),
      shellPath: Schema.optionalKey(f.shellPath),
      offlineFallback: Schema.optionalKey(f.offlineFallback),
      networkTimeoutMs: Schema.optionalKey(f.networkTimeoutMs),
      cachePages: Schema.optionalKey(f.cachePages),
      denylist: Schema.optionalKey(f.denylist),
    })),
  ),
  neverCache: Schema.optionalKey(Schema.Array(Path)),
  update: Schema.optionalKey(
    UpdateConfig.mapFields((f) => ({
      checkIntervalMinutes: Schema.optionalKey(f.checkIntervalMinutes),
    })),
  ),
  /** Worker entry, relative to the Vite root. Default: `src/sw.ts` if it exists, else the built-in entry. */
  worker: Schema.optionalKey(Schema.NonEmptyString),
  swUrl: Schema.optionalKey(Path),
});
/** What the user writes. */
export type PwaOptions = typeof PwaOptions.Encoded;

export interface ResolvedPwaConfig {
  readonly enabled: boolean;
  readonly dev: boolean;
  readonly preset: (typeof PRESET_NAMES)[number];
  readonly manifest: WebAppManifest | null;
  readonly precache: typeof PrecacheConfig.Type;
  readonly strategies: ReadonlyArray<StrategyRule>;
  readonly navigation: NavigationConfig;
  readonly neverCache: ReadonlyArray<string>;
  readonly update: UpdateConfig;
  /** `null` means: `src/sw.ts` if it exists, else the built-in entry. */
  readonly worker: string | null;
  readonly swUrl: string;
}

/**
 * Fills every default. Precedence: explicit option, then preset, then base.
 * User `strategies` rules come first, then the preset's (first match wins).
 */
export const resolvePwaConfig = (
  options: typeof PwaOptions.Type,
): ResolvedPwaConfig => {
  const preset = options.preset ?? 'app';
  const defaults = PRESETS[preset];
  return {
    enabled: options.enabled ?? true,
    dev: options.dev ?? false,
    preset,
    manifest: options.manifest ?? null,
    precache: {
      include: options.precache?.include ?? [],
      exclude: options.precache?.exclude ?? [],
      warnAboveBytes: options.precache?.warnAboveBytes ?? 5 * 1024 * 1024,
    },
    strategies: [...(options.strategies ?? []), ...defaults.strategies],
    navigation: {
      shell: options.navigation?.shell ?? defaults.navigation.shell,
      shellPath: options.navigation?.shellPath ?? '/_shell',
      offlineFallback: options.navigation?.offlineFallback ?? '/offline',
      networkTimeoutMs: options.navigation?.networkTimeoutMs ?? 3000,
      cachePages:
        options.navigation?.cachePages ?? defaults.navigation.cachePages,
      denylist: options.navigation?.denylist ?? [],
    },
    neverCache: options.neverCache ?? ['/api/auth/'],
    update: {
      checkIntervalMinutes: options.update?.checkIntervalMinutes ?? 60,
    },
    worker: options.worker ?? null,
    swUrl: options.swUrl ?? '/sw.js',
  };
};

/** The config the worker runs with; part of the Build ID input. */
export const WorkerConfig = Schema.Struct({
  strategies: Schema.Array(StrategyRule),
  navigation: NavigationConfig,
  neverCache: Schema.Array(Path),
});
export type WorkerConfig = typeof WorkerConfig.Type;

export const workerConfigOf = (config: ResolvedPwaConfig): WorkerConfig => ({
  strategies: config.strategies,
  navigation: config.navigation,
  neverCache: config.neverCache,
});

/** Default export of `virtual:pwa-toolkit/build` (worker bundle only). */
export const WorkerBuildInfo = Schema.Struct({
  buildId: BuildId,
  precache: PrecacheList,
  config: WorkerConfig,
});
export type WorkerBuildInfo = typeof WorkerBuildInfo.Type;

/**
 * Default export of `virtual:pwa-toolkit/client` (client and ssr).
 * `buildId` is `null` in the client environment, which builds before the ID
 * exists; the page reads it from the Build ID meta tag instead.
 */
export const ClientBuildInfo = Schema.Struct({
  enabled: Schema.Boolean,
  swUrl: Path,
  scope: Path,
  update: UpdateConfig,
  buildId: Schema.NullOr(BuildId),
  manifestUrl: Schema.NullOr(Path),
  appleTouchIconUrl: Schema.NullOr(Schema.String),
});
export type ClientBuildInfo = typeof ClientBuildInfo.Type;
