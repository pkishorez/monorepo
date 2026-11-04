/*
 * Everything Code keeps in this browser, gone at once, for a fresh start
 * when something looks stuck: every IndexedDB database, local and session
 * storage, the offline copy of the app and the service worker that keeps
 * it. Cookies stay, and with them the sign-in and the theme. Each part is
 * best effort, so one that fails never keeps the rest.
 */

/** Deletes one database; another tab holding it open is waited on only a moment. */
const deleteDatabase = (name: string) =>
  new Promise<void>((done) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => done();
    request.onerror = () => done();
    // Its holder closes it as it hears of the delete; the delete waits for that.
    request.onblocked = () => setTimeout(done, 2000);
  });

const attempt = async (clear: () => unknown) => {
  try {
    await clear();
  } catch {
    // Best effort: what one part keeps, the rest still delete.
  }
};

/** Deletes everything Code keeps in this browser, then reloads it, as on a first visit. */
export const clearAndReload = async () => {
  await Promise.all([
    attempt(async () => {
      const databases = await indexedDB.databases();
      await Promise.all(
        databases.flatMap(({ name }) =>
          name === undefined ? [] : [deleteDatabase(name)],
        ),
      );
    }),
    attempt(() => localStorage.clear()),
    attempt(() => sessionStorage.clear()),
    attempt(async () => {
      const names = await caches.keys();
      await Promise.all(names.map((name) => caches.delete(name)));
    }),
    attempt(async () => {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((each) => each.unregister()));
    }),
  ]);
  location.reload();
};
