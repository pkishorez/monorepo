import * as Schema from 'effect/Schema';
import * as Struct from 'effect/Struct';
import { BuildId, PrecacheList } from '../build/index.js';
import { THEME_COLORS, DEFAULT_THEME } from '../../../../ui/theme/model.ts';
import { DEFAULT_ICONS, WebAppManifest } from '../manifest/index.js';
import { StrategyRule } from '../strategy/index.js';
import { PRESET_NAMES, PRESETS } from './presets.js';

const Path = Schema.String.check(Schema.isStartingWith('/'));
const PositiveInt = Schema.Int.check(Schema.isGreaterThan(0));

/**
 * How navigations resolve. Each page's own way follows from its Render
 * Mode, as Kabuki Start lists them; this only says how long a page waits
 * for the network, and which paths the worker leaves alone.
 */
export const NavigationConfig = Schema.Struct({
  networkTimeoutMs: PositiveInt,
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

/** The manifest beyond its name, every field optional. */
const ManifestOptions = WebAppManifest.mapFields(Struct.omit(['name']));

/** Options to `pwa({...})`. Only `name` is required; see `resolvePwaConfig`. */
export const PwaOptions = Schema.Struct({
  /** The app's name, as the manifest and the Install Prompt give it. */
  name: Schema.NonEmptyString,
  enabled: Schema.optionalKey(Schema.Boolean),
  dev: Schema.optionalKey(Schema.Boolean),
  preset: Schema.optionalKey(Schema.Literals(PRESET_NAMES)),
  /**
   * The rest of the manifest. Default: the default Theme's colors, and the
   * icons in the app's `public/`: `icon-192.png`, `icon-512.png`,
   * `icon-maskable-512.png` and `apple-touch-icon.png`.
   */
  manifest: Schema.optionalKey(ManifestOptions),
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
      networkTimeoutMs: Schema.optionalKey(f.networkTimeoutMs),
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
  /**
   * What the page reports about its build. Default: the time the build
   * runs, and `git rev-parse --short HEAD` (with `-dirty` for uncommitted
   * changes), or none when git is not available.
   */
  version: Schema.optionalKey(
    Schema.Struct({
      commit: Schema.optionalKey(Schema.NonEmptyString),
      builtAt: Schema.optionalKey(Schema.NonEmptyString),
    }),
  ),
});
/** What the user writes. */
export type PwaOptions = typeof PwaOptions.Encoded;

export interface ResolvedPwaConfig {
  readonly enabled: boolean;
  readonly dev: boolean;
  readonly preset: (typeof PRESET_NAMES)[number];
  readonly manifest: WebAppManifest;
  readonly precache: typeof PrecacheConfig.Type;
  readonly strategies: ReadonlyArray<StrategyRule>;
  readonly navigation: NavigationConfig;
  readonly neverCache: ReadonlyArray<string>;
  readonly update: UpdateConfig;
  /** `null` means: `src/sw.ts` if it exists, else the built-in entry. */
  readonly worker: string | null;
  readonly swUrl: string;
  /** Overrides from `version`; the plugin fills the rest when it starts. */
  readonly version: {
    readonly commit: string | null;
    readonly builtAt: string | null;
  };
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
    manifest: {
      theme_color: THEME_COLORS[DEFAULT_THEME],
      background_color: THEME_COLORS[DEFAULT_THEME],
      icons: DEFAULT_ICONS,
      ...options.manifest,
      name: options.name,
    },
    precache: {
      include: options.precache?.include ?? [],
      exclude: options.precache?.exclude ?? [],
      warnAboveBytes: options.precache?.warnAboveBytes ?? 5 * 1024 * 1024,
    },
    strategies: [...(options.strategies ?? []), ...defaults.strategies],
    navigation: {
      networkTimeoutMs: options.navigation?.networkTimeoutMs ?? 3000,
      denylist: options.navigation?.denylist ?? [],
    },
    neverCache: options.neverCache ?? ['/api/auth/'],
    update: {
      checkIntervalMinutes: options.update?.checkIntervalMinutes ?? 60,
    },
    worker: options.worker ?? null,
    swUrl: options.swUrl ?? '/sw.js',
    version: {
      commit: options.version?.commit ?? null,
      builtAt: options.version?.builtAt ?? null,
    },
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
  /** When the build ran (ISO 8601). Server environment only, like `buildId`. */
  builtAt: Schema.NullOr(Schema.String),
  /** The git commit the build came from. Server environment only. */
  commit: Schema.NullOr(Schema.String),
  /** The app's name, from the manifest. */
  name: Schema.NonEmptyString,
  manifestUrl: Path,
  appleTouchIconUrl: Schema.NullOr(Schema.String),
});
export type ClientBuildInfo = typeof ClientBuildInfo.Type;
