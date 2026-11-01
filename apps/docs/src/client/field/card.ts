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

/** The screen's bottom edge on a phone, where words come up out of the page. */
export const rise = [
  'pointer-events-none fixed inset-x-0 bottom-0 z-[2] h-10 lg:hidden',
  'bg-linear-to-t from-background to-transparent',
  'opacity-0',
].join(' ');
