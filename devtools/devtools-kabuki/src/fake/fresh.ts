/*
 * Start fresh: the tab's whole world gone, as on a first visit. Nothing
 * can be deleted while the app has it open, so it takes a reload.
 *
 * 1. Ask     set a flag in sessionStorage, which a reload keeps, and
 *            reload.
 * 2. Clear   on the next start, before the app opens anything, delete
 *            every IndexedDB database of the origin (the Fake World's
 *            Snapshots and the app's tables), localStorage and
 *            sessionStorage, the flag with it. The app calls
 *            `beforeStart` first thing, and waits for it.
 */

/** The sessionStorage key that asks the next start to begin fresh. */
export const FRESH = '@kestack/devtools-kabuki/fake:fresh';

// 1. Ask
/** Reload the tab, and begin it with nothing kept. */
export const startFresh = (): void => {
  sessionStorage.setItem(FRESH, 'yes');
  location.reload();
};

// 2. Clear
const deleted = (name: string) =>
  new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    // Held open elsewhere: it goes once that lets go; nothing here waits.
    request.onblocked = () => resolve();
  });

/**
 * When Start fresh was asked, delete every IndexedDB database of the
 * origin, localStorage and sessionStorage. Call it first thing, before
 * anything opens one. Says whether it did.
 */
export const beforeStart = async (): Promise<boolean> => {
  if (typeof sessionStorage === 'undefined') return false;
  if (sessionStorage.getItem(FRESH) === null) return false;
  const databases =
    typeof indexedDB === 'undefined' ? [] : await indexedDB.databases();
  await Promise.all(
    databases.flatMap(({ name }) => (name ? [deleted(name)] : [])),
  );
  localStorage.clear();
  sessionStorage.clear();
  return true;
};
