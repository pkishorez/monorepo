import type { Side } from './chapters.ts';

/*
 * How a story's words sit with the field. On a wide screen they take the
 * half its shape leaves free and scroll past it there. On a phone the
 * shape holds the top of the screen, a little more than half of it, and
 * the words scroll up from below: they rise out of a soft edge at the
 * bottom, are read under the shape, then pass into the stage's curtain
 * and fade away, while the field is drawn sharp above it. The words never
 * fade on their own; the scroll and the curtain do it all.
 */

/**
 * A Stop: its words in the middle of a stretch of scroll long enough for
 * the shape before it to become its own. On a phone, three quarters of a
 * screen, so the place where words are read is never empty for long; on
 * a wide screen, where the words have a half of their own, one screen.
 */
export const stretch =
  'flex min-h-[75svh] flex-col justify-center lg:min-h-svh';

/**
 * A compact Stop, for a story whose shapes are small diagrams: less
 * scroll between them, so the page keeps moving. Three fifths of a screen
 * on a phone, a little over two thirds on a wide one.
 */
export const compact =
  'flex min-h-[60svh] flex-col justify-center lg:min-h-[70svh]';

/** The first Stop: one screen less the header, its words low on a phone, where they are read. */
export const opening =
  'flex min-h-[calc(100svh-3.5rem)] flex-col justify-end lg:justify-center';

/**
 * The last Stop: its words low on a phone too, so they come to rest where
 * words are read when the page can scroll no further. On a wide screen
 * the footer comes after it, so at the bottom of the page it can never
 * reach the middle of the screen, where its shape is: it is a screen less
 * twice the footer, 69px (components/footer.tsx), so its middle, where
 * its words are, lands on the screen's when the page scrolls no further.
 */
export const ending =
  'flex min-h-[75svh] flex-col justify-end lg:min-h-[calc(100svh-138px)] lg:justify-center';

/** The column inside a Stop: on a wide screen, two halves. */
export const halves =
  'mx-auto w-full max-w-7xl px-4 sm:px-6 lg:grid lg:grid-cols-2 lg:gap-16 lg:px-8';

/** The words, in the half the shape leaves free; an opening's headline gets all of it. */
export const card = (side: Side, first: boolean) =>
  [
    'max-lg:pb-10',
    first ? 'lg:max-w-none' : 'lg:max-w-md',
    side === 'left' ? 'lg:col-start-2' : '',
  ].join(' ');

/**
 * The stage's curtain on a phone: the page's own ground, solid, down to
 * where the stage ends, which placement.ts's `room` names too, so nothing
 * shows through behind the shape; then a 3rem edge that fades, a little
 * blurred, so words dissolve into it as they rise rather than meet a line.
 */
export const curtain = [
  'pointer-events-none fixed inset-x-0 top-0 z-[2] lg:hidden',
  'h-[calc(max(40svh,min(55svh,100svh_-_23.75rem))_+_3rem)]',
  'bg-background backdrop-blur-sm',
  '[mask-image:linear-gradient(to_bottom,black_calc(100%_-_3rem),transparent)]',
  // field.tsx sets its opacity as the page scrolls.
  'opacity-0',
].join(' ');

/**
 * What the shapes sit on, drawn behind the canvas: a soft pool of light on
 * the paper, like a lamp over a drawing (barely there in the dark, where
 * the points are the light); a fine grain over it; and a grid of dots,
 * like drafting paper. The pool and the grid are seen only in a soft
 * circle round the shape, which field.tsx moves with it through
 * `--grid-x`, `--grid-y` and `--grid-r`, so they cross the screen as the
 * shape does. On a phone it all keeps to the stage, above the words.
 */
export const backdrop = [
  'absolute inset-0 opacity-0 transition-opacity duration-700 ease-out',
  'max-lg:bottom-auto max-lg:h-[max(40svh,min(55svh,100svh_-_23.75rem))]',
  'max-lg:[mask-image:linear-gradient(to_bottom,black_75%,transparent)]',
].join(' ');
// On the page's own ground, so the grain over it has something to blend
// with everywhere, not only where the light is; the light itself is POOL.
export const pool = 'absolute inset-0 bg-background';

/**
 * The light, as a lamp throws it: brightest under the shape and falling
 * away slowly, eased like a smoothstep rather than straight, so it has no
 * edge to see, out to well past the shape.
 */
const FALL = [
  [0, 1],
  [0.15, 0.97],
  [0.3, 0.88],
  [0.45, 0.72],
  [0.6, 0.5],
  [0.74, 0.29],
  [0.86, 0.12],
  [0.95, 0.03],
  [1, 0],
] as const;
export const POOL = `radial-gradient(calc(var(--grid-r) * 1.8) calc(var(--grid-r) * 1.8) at var(--grid-x) var(--grid-y), ${FALL.map(
  ([at, light]) =>
    `color-mix(in oklab, var(--field-light) ${light * 100}%, transparent) ${at * 100}%`,
).join(', ')})`;

/**
 * Even eased, a fall of light across a few dozen shades shows its steps
 * as rings. A grain that moves each pixel a shade up or down, and on
 * average not at all (overlay on mid grey), dithers the steps away, and
 * gives the paper a tooth.
 */
export const grain =
  'absolute inset-0 opacity-(--field-grain) mix-blend-overlay';
export const GRAIN = `url("data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='g'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0.5 0 0 0 0.25 0.5 0 0 0 0.25 0.5 0 0 0 0.25 0 0 0 0 1'/></filter><rect width='100%' height='100%' filter='url(#g)'/></svg>",
)}")`;

export const grid = [
  'absolute inset-0',
  'bg-[radial-gradient(circle,var(--field-grid)_1px,transparent_1.5px)] bg-size-[22px_22px]',
  '[mask-image:radial-gradient(var(--grid-r)_var(--grid-r)_at_var(--grid-x)_var(--grid-y),black_15%,transparent_100%)]',
].join(' ');

/** The screen's bottom edge on a phone, where words come up out of the page. */
export const rise = [
  'pointer-events-none fixed inset-x-0 bottom-0 z-[2] h-10 lg:hidden',
  'bg-linear-to-t from-background to-transparent',
  'opacity-0',
].join(' ');
