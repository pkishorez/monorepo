import {
  CACHE_PREFIX,
  FORMER_CACHE_PREFIX,
} from '../../contract/build/index.js';

/**
 * The Kill Switch worker. Plain script with none of the worker's runtime, so
 * it works even when the runtime is what broke: activate at once, delete
 * every cache of the PWA's, under its name today or its former one,
 * unregister, then reload the pages it controlled.
 */
export const killSwitchSource = (): string => `// web-platform Kill Switch
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter((name) => ${JSON.stringify([CACHE_PREFIX, FORMER_CACHE_PREFIX])}.some((prefix) => name.startsWith(prefix)))
        .map((name) => caches.delete(name)),
    );
    await self.registration.unregister();
    const tabs = await self.clients.matchAll({ type: 'window' });
    await Promise.all(tabs.map((tab) => tab.navigate(tab.url).catch(() => undefined)));
  })());
});
`;
