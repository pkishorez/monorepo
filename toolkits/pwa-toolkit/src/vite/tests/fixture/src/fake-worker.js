// Stands in for `pwa-toolkit/worker` when testing the built-in entry.
export const runServiceWorker = () => {
  self.__PWA_DEFAULT_ENTRY__ = true;
};
