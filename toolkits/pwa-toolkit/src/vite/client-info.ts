import { BuildId, MANIFEST_URL } from '../domain/build/index.js';
import type {
  ClientBuildInfo,
  ResolvedPwaConfig,
} from '../domain/config/index.js';
import type { WebAppManifest } from '../domain/manifest/index.js';

const DEV_BUILD_ID = BuildId.make('dev');

/** 180×180 if listed, else the first non-maskable PNG. iOS ignores maskable art. */
const appleTouchIconOf = (manifest: WebAppManifest): string | null => {
  const icons = manifest.icons ?? [];
  const exact = icons.find((icon) =>
    (icon.sizes ?? '').split(/\s+/).includes('180x180'),
  );
  const png = icons.find(
    (icon) =>
      (icon.type === 'image/png' || icon.src.endsWith('.png')) &&
      (icon.purpose === undefined || icon.purpose.split(' ').includes('any')),
  );
  return (exact ?? png)?.src ?? null;
};

/**
 * Default export of `virtual:pwa-toolkit/client` for one environment.
 * The client environment never knows the Build ID (it builds first); the
 * server environment gets it once the client build has produced it, and
 * `dev` while serving.
 */
export const clientBuildInfo = (
  config: ResolvedPwaConfig,
  context: {
    readonly serving: boolean;
    readonly consumer: 'client' | 'server';
    readonly buildId: BuildId | null;
  },
): ClientBuildInfo => {
  const active = config.enabled && (!context.serving || config.dev);
  const serverBuildId = context.serving ? DEV_BUILD_ID : context.buildId;
  return {
    enabled: active,
    swUrl: config.swUrl,
    scope: '/',
    update: config.update,
    buildId: context.consumer === 'server' && active ? serverBuildId : null,
    manifestUrl: config.manifest ? MANIFEST_URL : null,
    themeColor: config.manifest?.theme_color ?? null,
    appleTouchIconUrl: config.manifest
      ? appleTouchIconOf(config.manifest)
      : null,
  };
};
