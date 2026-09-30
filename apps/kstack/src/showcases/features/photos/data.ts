/** What a photo shows: each is drawn, not downloaded, so the library works offline. */
export type Scene =
  | 'sunset'
  | 'beach'
  | 'mountains'
  | 'city'
  | 'night'
  | 'forest'
  | 'desert'
  | 'bloom';

/** One photo in the library. */
export interface Photo {
  readonly id: string;
  readonly scene: Scene;
  /** Seeds its drawing, so it looks the same every time. */
  readonly seed: number;
  /** Width over height. */
  readonly aspect: number;
  readonly hue: number;
  /** When it was taken, in ms since the epoch. */
  readonly taken: number;
  readonly favorite: boolean;
}

/** A named set of photos, listed in the Albums sidebar. */
export interface Album {
  readonly slug: string;
  readonly title: string;
  readonly photos: ReadonlyArray<Photo>;
}

/** A small seeded random (mulberry32): the same seed, the same numbers. */
export const random = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const SCENES: ReadonlyArray<Scene> = [
  'sunset',
  'beach',
  'mountains',
  'city',
  'night',
  'forest',
  'desert',
  'bloom',
];
const ASPECTS = [3 / 4, 3 / 4, 3 / 4, 4 / 3, 4 / 3, 9 / 16, 16 / 9, 1, 2 / 3];
const NEWEST = Date.UTC(2026, 8, 28, 18, 42);
const HOUR = 3_600_000;

const build = (): ReadonlyArray<Photo> => {
  const rand = random(7);
  let taken = NEWEST;
  let scene = SCENES[0] ?? 'sunset';
  return Array.from({ length: 60 }, (_, i) => {
    // Photos come in little bursts of the same place.
    if (i === 0 || rand() < 0.45) {
      scene = SCENES[Math.floor(rand() * SCENES.length)] ?? scene;
    }
    taken -= rand() < 0.5 ? rand() * 0.2 * HOUR : (4 + rand() * 60) * HOUR;
    return {
      id: `p${i + 1}`,
      scene,
      seed: 1000 + i * 97,
      aspect: ASPECTS[Math.floor(rand() * ASPECTS.length)] ?? 1,
      hue: Math.floor(rand() * 360),
      taken,
      favorite: rand() < 0.2,
    };
  });
};

/** Every photo, newest first. */
export const PHOTOS = build();

const of = (...scenes: ReadonlyArray<Scene>) =>
  PHOTOS.filter((photo) => scenes.includes(photo.scene));

/** The albums, in the order the sidebar lists them; the first is every photo. */
export const ALBUMS: ReadonlyArray<Album> = [
  { slug: 'recents', title: 'Recents', photos: PHOTOS },
  {
    slug: 'favorites',
    title: 'Favorites',
    photos: PHOTOS.filter((photo) => photo.favorite),
  },
  { slug: 'sunsets', title: 'Golden hour', photos: of('sunset', 'desert') },
  { slug: 'coast', title: 'Coast', photos: of('beach') },
  { slug: 'outdoors', title: 'Outdoors', photos: of('mountains', 'forest') },
  { slug: 'city', title: 'After dark', photos: of('city', 'night') },
  { slug: 'garden', title: 'Garden', photos: of('bloom') },
].filter((album) => album.photos.length > 0);
