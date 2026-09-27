import { CACHE_PREFIX } from '../../shared/build/index.js';

/**
 * The Kill Switch worker. Plain script with no toolkit runtime, so it works
 * even when the runtime is what broke: activate at once, delete every toolkit
 * cache, unregister, then reload the tabs it controlled.
 */
export const killSwitchSource = (): string => `// pwa-toolkit Kill Switch
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter((name) => name.startsWith(${JSON.stringify(CACHE_PREFIX)}))
        .map((name) => caches.delete(name)),
    );
    await self.registration.unregister();
    const tabs = await self.clients.matchAll({ type: 'window' });
    await Promise.all(tabs.map((tab) => tab.navigate(tab.url).catch(() => undefined)));
  })());
});
`;
