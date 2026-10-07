import { BuildId, MANIFEST_URL } from '../../shared/build/index.js';
import type {
  ClientBuildInfo,
  ResolvedPwaConfig,
} from '../../shared/config/index.js';
import type { WebAppManifest } from '../../shared/manifest/index.js';
import type { BuildVersion } from './build-version.js';

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
 * `dev` while serving. The build's commit and time go to the server
 * environment too, so they reach the page only through its meta tags and
 * always describe the build that rendered it.
 */
export const clientBuildInfo = (
  config: ResolvedPwaConfig,
  context: {
    readonly serving: boolean;
    readonly consumer: 'client' | 'server';
    readonly buildId: BuildId | null;
    readonly version: BuildVersion;
  },
): ClientBuildInfo => {
  const active = config.enabled && (!context.serving || config.dev);
  const serverBuildId = context.serving ? DEV_BUILD_ID : context.buildId;
  const server = context.consumer === 'server';
  return {
    enabled: active,
    swUrl: config.swUrl,
    scope: '/',
    update: config.update,
    buildId: server && active ? serverBuildId : null,
    builtAt: server ? context.version.builtAt : null,
    commit: server ? context.version.commit : null,
    manifestUrl: config.manifest ? MANIFEST_URL : null,
    appleTouchIconUrl: config.manifest
      ? appleTouchIconOf(config.manifest)
      : null,
  };
};
