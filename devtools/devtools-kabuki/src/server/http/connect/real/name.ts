const ASKED = 'kabuki-session';

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

export type Kept = Pick<Storage, 'getItem' | 'setItem'> | undefined;

const askedIn = (page: string): string | undefined => {
  try {
    return new URL(page).searchParams.get(ASKED) || undefined;
  } catch {
    return undefined;
  }
};

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

export const keep = (kept: Kept, app: string, name: string): void => {
  try {
    kept?.setItem(keyOf(app), name);
  } catch {
    return;
  }
};

export const tabStorage = (): Kept => {
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined;
  }
};
