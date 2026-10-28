/*
 * The name a Kabuki Session asks DevTools for, first found of:
 *
 * 1. Asked   `?kabuki-session=…` in the page's URL.
 * 2. Given   the name `connect` was given.
 * 3. Kept    the name this tab used before for this app, in
 *            sessionStorage, so a reload asks for the same one.
 * 4. Made    a readable name, `quiet-otter`.
 *
 * DevTools may answer another, `quiet-otter-2` on a clash; that one is
 * kept for the next reload.
 */

/** The query parameter that names a Kabuki Session in the page's URL. */
export const ASKED = 'kabuki-session';

const keyOf = (app: string) => `@kestack/devtools-kabuki:${app}:name`;

const ADJECTIVES = [
  'quiet',
  'brave',
  'calm',
  'eager',
  'gentle',
  'happy',
  'jolly',
  'lucky',
  'merry',
  'nimble',
  'proud',
  'swift',
  'tidy',
  'witty',
  'bold',
  'clever',
] as const;

const ANIMALS = [
  'otter',
  'badger',
  'falcon',
  'heron',
  'lynx',
  'marten',
  'panda',
  'puffin',
  'raven',
  'seal',
  'stoat',
  'tapir',
  'walrus',
  'wombat',
  'yak',
  'zebra',
] as const;

/** Where a tab keeps what it remembers; none where storage is shut. */
export type Kept = Pick<Storage, 'getItem' | 'setItem'> | undefined;

// 1. Asked
/** The name the page's URL asks for, if it does. */
export const askedIn = (page: string): string | undefined => {
  try {
    return new URL(page).searchParams.get(ASKED) || undefined;
  } catch {
    return undefined;
  }
};

// 4. Made
export const readableName = (random: () => number = Math.random): string => {
  const pick = <A>(from: ReadonlyArray<A>) =>
    from[Math.floor(random() * from.length)]!;
  return `${pick(ADJECTIVES)}-${pick(ANIMALS)}`;
};

export const nameFor = (options: {
  readonly app: string;
  readonly page: string;
  readonly given?: string | undefined;
  readonly kept: Kept;
  readonly random?: () => number;
}): string =>
  askedIn(options.page) ??
  options.given ??
  options.kept?.getItem(keyOf(options.app)) ??
  readableName(options.random);

// 3. Kept
/** Keep the name for this tab's next reload; storage that is full or shut keeps nothing. */
export const keep = (kept: Kept, app: string, name: string): void => {
  try {
    kept?.setItem(keyOf(app), name);
  } catch {
    // A tab that cannot keep it makes one again next time.
  }
};

/** This tab's sessionStorage, where there is one to use. */
export const tabStorage = (): Kept => {
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined;
  }
};
