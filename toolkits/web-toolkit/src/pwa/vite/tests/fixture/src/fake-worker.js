// Stands in for `@kstackz/web-toolkit/pwa/worker` when testing the built-in entry.
export const runServiceWorker = () => {
  self.__PWA_DEFAULT_ENTRY__ = true;
};
