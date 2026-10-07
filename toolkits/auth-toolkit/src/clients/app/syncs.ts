const PREFIX = 'user-';

// Std Sync keeps a name lowercase, with a dash for anything else.
const normalize = (name: string) =>
  name
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** The name of one user's Std Sync on this device: name a session's sync
 * with it, and what it keeps is deleted once the user signs out. */
export const syncName = (userId: string) => normalize(`${PREFIX}${userId}`);

/**
 * Keeps the Std Sync of every user still signed in, deletes every other
 * user's, and says which it deleted. Only names `syncName` makes are
 * touched; whatever else the device keeps under Std Sync is left alone.
 */
export const keepSyncs = async (
  userIds: ReadonlyArray<string>,
  sync: {
    readonly list: () => Promise<ReadonlyArray<{ readonly name: string }>>;
    readonly remove: (name: string) => Promise<void>;
  },
) => {
  const kept = new Set(userIds.map(syncName));
  const gone = (await sync.list())
    .map(({ name }) => name)
    .filter((name) => name.startsWith(PREFIX) && !kept.has(name));
  await Promise.all(gone.map((name) => sync.remove(name)));
  return gone;
};
