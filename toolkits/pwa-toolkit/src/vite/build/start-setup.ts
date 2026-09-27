import type { NavigationConfig } from '../../domain/config/index.js';

// Start's plugin whose post `buildApp` hook prerenders pages.
const START_POST_BUILD = 'tanstack-start-core:post-build';

/**
 * The worker must build after Start prerenders the App Shell and Offline
 * Fallback. Both post `buildApp` hooks run in plugin order, so `pwa()` has
 * to come after `tanstackStart()`.
 */
export const assertAfterStart = (
  plugins: ReadonlyArray<{ readonly name: string }>,
  ownName: string,
): void => {
  const names = plugins.map((plugin) => plugin.name);
  const start = names.indexOf(START_POST_BUILD);
  if (start !== -1 && start > names.indexOf(ownName)) {
    throw new Error(
      'pwa-toolkit: put pwa() after tanstackStart() in the Vite plugins, so the worker builds after prerendering',
    );
  }
};

/**
 * Start's plugin keeps its options to itself, so the app sets the prerender
 * options; this names exactly what is missing.
 */
export const missingDocumentsMessage = (
  navigation: NavigationConfig,
  missing: ReadonlyArray<string>,
): string => {
  const lines = [
    `pwa-toolkit: not in the Precache, no prerendered HTML for ${missing.join(', ')}. Set in tanstackStart({...}):`,
  ];
  if (navigation.shell && missing.includes(navigation.shellPath)) {
    lines.push(
      `  spa: { enabled: true, prerender: { outputPath: '${navigation.shellPath}' } },`,
    );
  }
  if (missing.includes(navigation.offlineFallback)) {
    lines.push(
      `  pages: [{ path: '${navigation.offlineFallback}', prerender: { enabled: true, crawlLinks: false, autoSubfolderIndex: false } }],`,
      '  prerender: { autoStaticPathsDiscovery: false },',
    );
  }
  return lines.join('\n');
};

export const subfolderIndexMessage = (paths: ReadonlyArray<string>): string =>
  `pwa-toolkit: ${paths.join(', ')} prerendered as <path>/index.html, which hosts redirect to <path>/. Set prerender: { autoSubfolderIndex: false } on those pages.`;
