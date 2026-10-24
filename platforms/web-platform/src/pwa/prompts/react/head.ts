import {
  BUILD_ID_META_NAME,
  BUILT_AT_META_NAME,
  COMMIT_META_NAME,
} from '../../engine/shared/build/index.js';
import type { ClientBuildInfo } from '../../engine/shared/config/index.js';
import { splashHead } from '../splash/index.ts';

export interface HeadTags {
  readonly meta: Array<{ readonly name: string; readonly content: string }>;
  readonly links: Array<{
    readonly rel: string;
    readonly href: string;
    readonly sizes?: string;
    readonly media?: string;
  }>;
}

/**
 * The build this page came from. `builtAt` is an ISO 8601 string, so the
 * server and the browser render the same text; format it after mount.
 * Each field is `null` when the build has none (`buildId` while the PWA is off).
 */
export interface PwaVersion {
  readonly buildId: string | null;
  readonly builtAt: string | null;
  readonly commit: string | null;
}

const metaContent = (name: string): string | null =>
  document.querySelector(`meta[name="${name}"]`)?.getAttribute('content') ??
  null;

/**
 * The server knows the build from the virtual module; the client build does
 * not, so in the browser it reads the tags the server rendered. The page
 * then reports the build that rendered it, even while a newer one waits.
 */
export const pageVersion = (info: ClientBuildInfo): PwaVersion =>
  typeof document === 'undefined'
    ? { buildId: info.buildId, builtAt: info.builtAt, commit: info.commit }
    : {
        buildId: metaContent(BUILD_ID_META_NAME),
        builtAt: metaContent(BUILT_AT_META_NAME),
        commit: metaContent(COMMIT_META_NAME),
      };

const metaOf = (name: string, content: string | null) =>
  content === null ? [] : [{ name, content }];

export const headTags = (
  info: ClientBuildInfo,
  version: PwaVersion,
): HeadTags => {
  // `apple-mobile-web-app-capable` comes only with the Splash, which iOS
  // will not show without it. It puts iOS home-screen apps in the legacy
  // mode, where the status bar ignores an in-place `theme-color` switch;
  // `splashHead` counts on the Status Bar Surface to tint it instead.
  const splash = info.splash ? splashHead() : { meta: [], links: [] };
  return {
    meta: [
      { name: 'mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-title', content: info.title },
      ...splash.meta,
      ...metaOf(BUILD_ID_META_NAME, version.buildId),
      ...metaOf(BUILT_AT_META_NAME, version.builtAt),
      ...metaOf(COMMIT_META_NAME, version.commit),
    ],
    links: [
      { rel: 'manifest', href: info.manifestUrl },
      ...(info.appleTouchIconUrl === null
        ? []
        : [{ rel: 'apple-touch-icon', href: info.appleTouchIconUrl }]),
      ...splash.links,
    ],
  };
};
