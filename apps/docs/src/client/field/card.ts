/*
 * How a Stop's words sit over the field. On a wide screen they take the
 * half its shape leaves free, on open ground. On a phone the shape is
 * always up top, so the card pins to the bottom of the screen on a soft
 * scrim while its Stop passes, as tall as the field leaves it room for
 * (see placement.ts).
 *
 * The scroll moves the words with the shapes: they rise in as they arrive
 * and fade as they leave, on a phone as soon as they rise into the shape's
 * half of the screen, so they never cross the next picture. Only a browser
 * that can drive an animation by scroll runs them; any other shows the
 * words still, never hidden.
 */

const scrolled =
  'supports-[animation-timeline:view()]:[animation-timing-function:linear] supports-[animation-timeline:view()]:[animation-fill-mode:both]';

export const card = [
  '-mx-4 px-4 pt-10 pb-[calc(2.5rem+env(safe-area-inset-bottom))]',
  'bg-background/85 [mask-image:linear-gradient(to_bottom,transparent,black_2.5rem)]',
  'sm:-mx-6 sm:px-6',
  'lg:mx-0 lg:max-w-md lg:bg-transparent lg:px-0 lg:py-0 lg:[mask-image:none]',
  scrolled,
  'supports-[animation-timeline:view()]:[animation-name:exit]',
  '[animation-timeline:view()] [animation-range:exit_15%_exit_75%]',
  'max-lg:[animation-timeline:view(block_38%_0%)] max-lg:[animation-range:exit_0%_exit_35%]',
  '[--tw-exit-opacity:0] [--tw-exit-translate-y:-1rem] max-lg:[--tw-exit-translate-y:-0.75rem] motion-reduce:[--tw-exit-translate-y:0]',
].join(' ');

/** The words inside a card, rising in as they arrive. */
export const words = [
  scrolled,
  'supports-[animation-timeline:view()]:[animation-name:enter]',
  '[animation-timeline:view()] [animation-range:entry_0%_entry_80%]',
  '[--tw-enter-opacity:0] [--tw-enter-translate-y:1.5rem] motion-reduce:[--tw-enter-translate-y:0]',
].join(' ');

/** A Stop's height: long enough for its shape to form and hold. */
export const stretch =
  'flex min-h-[120svh] flex-col justify-end lg:min-h-svh lg:justify-center';
