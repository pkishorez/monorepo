/** Where Std Sync copies live, and how one is deleted. */
export type CopyStore = {
  readonly list: () => Promise<ReadonlyArray<{ readonly name: string }>>;
  readonly remove: (name: string) => Promise<void>;
};

const USER = 'user-';
// Before this convention a User's copy was named `ledger-<id>`.
const OWNED = [USER, 'ledger-'];

// Std Sync keeps a name lowercase, with a dash for anything else.
const normalize = (name: string) =>
  name
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** The name of one User's copy of their money on this device. */
export const copyName = (userId: string) => normalize(`${USER}${userId}`);

/**
 * Keeps the copy of every User still signed in on this device and deletes
 * every other User's. Only names it owns are touched; the device's own
 * stores are not. Call it only with a list the sign-in service gave.
 */
export const reconcileCopies = async (
  signedIn: ReadonlyArray<string>,
  store: CopyStore,
): Promise<ReadonlyArray<string>> => {
  const keep = new Set(signedIn.map(copyName));
  const stale = (await store.list())
    .map(({ name }) => name)
    .filter(
      (name) =>
        OWNED.some((prefix) => name.startsWith(prefix)) && !keep.has(name),
    );
  await Promise.all(stale.map(store.remove));
  return stale;
};
