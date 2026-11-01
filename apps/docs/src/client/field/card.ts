import type { Side } from './chapters.ts';

/*
 * How a story's words sit with the field. On a wide screen they take the
 * half its shape leaves free and scroll past it there. On a phone the
 * shape holds the top of the screen, a little more than half of it, and
 * the words scroll up from below: they are read under the shape, then
 * pass under the stage's frosted glass and blur away, while the field is
 * drawn sharp above the glass. The words never fade on their own; the
 * scroll and the glass do it all.
 */

/**
 * A Stop: its words in the middle of a stretch of scroll long enough for
 * the shape before it to become its own. On a phone, three quarters of a
 * screen, so the place where words are read is never empty for long; on
 * a wide screen, where the words have a half of their own, one screen.
 */
export const stretch =
  'flex min-h-[75svh] flex-col justify-center lg:min-h-svh';

/** The first Stop: one screen less the header, its words low on a phone, where they are read. */
export const opening =
  'flex min-h-[calc(100svh-3.5rem)] flex-col justify-end lg:justify-center';

/**
 * The last Stop: its words low on a phone too, so they come to rest where
 * words are read when the page can scroll no further.
 */
export const ending =
  'flex min-h-[75svh] flex-col justify-end lg:min-h-svh lg:justify-center';

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
 * The stage's glass on a phone: frosted down to where the stage ends,
 * which placement.ts's `room` names too, then melting into the clear over
 * 2.5rem below it, so words blur as they rise rather than at a line, and
 * never while the shape is over them.
 */
export const glass = [
  'pointer-events-none fixed inset-x-0 top-0 z-[2] lg:hidden',
  'h-[calc(max(40svh,min(55svh,100svh_-_23.75rem))_+_2.5rem)]',
  'bg-background/55 backdrop-blur-md',
  '[mask-image:linear-gradient(to_bottom,black_calc(100%_-_2.5rem),transparent)]',
  'opacity-0 transition-opacity duration-500 ease-out data-[on=true]:opacity-100 motion-reduce:transition-none',
].join(' ');
