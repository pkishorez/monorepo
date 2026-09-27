import { BUILD_ID_META_NAME } from '../domain/build/index.js';
import type { ClientBuildInfo } from '../domain/config/index.js';

export interface HeadTags {
  readonly meta: Array<{ readonly name: string; readonly content: string }>;
  readonly links: Array<{
    readonly rel: string;
    readonly href: string;
    readonly sizes?: string;
  }>;
}

/**
 * The server knows the Build ID from its build; the client build does not,
 * so in the browser it reuses the tag the server rendered and hydration matches.
 */
export const pageBuildId = (info: ClientBuildInfo): string | null =>
  typeof document === 'undefined'
    ? info.buildId
    : (document
        .querySelector(`meta[name="${BUILD_ID_META_NAME}"]`)
        ?.getAttribute('content') ?? null);

export const headTags = (
  info: ClientBuildInfo,
  buildId: string | null,
): HeadTags => ({
  // No `apple-mobile-web-app-capable`: it puts iOS home-screen apps in the
  // legacy mode, where the status bar ignores an in-place theme switch.
  meta: [
    { name: 'mobile-web-app-capable', content: 'yes' },
    ...(buildId === null
      ? []
      : [{ name: BUILD_ID_META_NAME, content: buildId }]),
  ],
  links: [
    ...(info.manifestUrl === null
      ? []
      : [{ rel: 'manifest', href: info.manifestUrl }]),
    ...(info.appleTouchIconUrl === null
      ? []
      : [{ rel: 'apple-touch-icon', href: info.appleTouchIconUrl }]),
  ],
});
