import { Context } from 'effect';
import type { Stream } from 'effect';
import type { Direction } from '../rules.ts';

/** A key that matters to the game, or the keys going back to the page. */
export type Press = Direction | 'space' | 'away';

/**
 * What the app's Layer gives for input: every Press while it runs. The
 * browser's listens to the page; a test's is pressed by hand.
 */
export class Keyboard extends Context.Service<
  Keyboard,
  { readonly presses: Stream.Stream<Press> }
>()('Keyboard') {}
