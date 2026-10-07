import type { Device } from './device.js';
import type { TokenSet, UserInfo } from './token-endpoint.js';

/** One signed-in User's secure-storage entry: who they are and their own
 * tokens. Never written anywhere else. */
export interface Entry extends TokenSet {
  readonly user: UserInfo;
}

/** Which Users are signed in, in the order they signed in, and which is
 * active. Holds no tokens. */
interface Roster {
  readonly users: ReadonlyArray<string>;
  readonly active: string | null;
}

const EMPTY: Roster = { users: [], active: null };

// Secure-storage keys allow only letters, digits, `.`, `-` and `_`.
const keySafe = (id: string) =>
  /^[\w.-]+$/.test(id)
    ? id
    : Array.from(new TextEncoder().encode(id), (byte) =>
        byte.toString(16).padStart(2, '0'),
      ).join('');

const parse = <T>(value: string | null): T | null => {
  if (value === null) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

/** The Users kept in secure storage: one entry per User under
 * `<prefix>.user.<id>`, and the roster under `<prefix>.users`. Every change
 * runs one at a time, so two of them never interleave. */
export const keychain = (secrets: Device['secrets'], prefix: string) => {
  const rosterKey = `${prefix}.users`;
  const entryKey = (id: string) => `${prefix}.user.${keySafe(id)}`;

  let queue: Promise<unknown> = Promise.resolve();
  const serially = <T>(run: () => Promise<T>): Promise<T> => {
    const next = queue.then(run, run);
    queue = next.catch(() => undefined);
    return next;
  };

  const roster = async () =>
    parse<Roster>(await secrets.get(rosterKey)) ?? EMPTY;
  const entry = async (id: string) =>
    parse<Entry>(await secrets.get(entryKey(id)));

  return {
    roster,
    entry,
    /** Keeps a User's entry, adds them last, and makes them active. */
    add: (value: Entry) =>
      serially(async () => {
        await secrets.set(entryKey(value.user.id), JSON.stringify(value));
        const { users } = await roster();
        const next: Roster = {
          users: [...users.filter((id) => id !== value.user.id), value.user.id],
          active: value.user.id,
        };
        await secrets.set(rosterKey, JSON.stringify(next));
      }),
    /** Replaces a signed-in User's tokens. */
    update: (value: Entry) =>
      serially(async () => {
        const { users } = await roster();
        if (!users.includes(value.user.id)) return;
        await secrets.set(entryKey(value.user.id), JSON.stringify(value));
      }),
    activate: (id: string) =>
      serially(async () => {
        const current = await roster();
        if (!current.users.includes(id)) return;
        await secrets.set(
          rosterKey,
          JSON.stringify({ ...current, active: id }),
        );
      }),
    /** Forgets a User; if they were active, the first one left is. */
    remove: (id: string) =>
      serially(async () => {
        const { users, active } = await roster();
        const left = users.filter((user) => user !== id);
        const next: Roster = {
          users: left,
          active:
            active !== null && left.includes(active)
              ? active
              : (left[0] ?? null),
        };
        await secrets.set(rosterKey, JSON.stringify(next));
        await secrets.remove(entryKey(id));
      }),
  };
};

export type Keychain = ReturnType<typeof keychain>;
