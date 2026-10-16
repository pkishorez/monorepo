import { Page } from '@kestack/kabuki/routing';
import { about, Luck } from '../data/index.ts';

/*
 * A client page whose Loader takes a second and then fails half the time.
 * The server sends it loading; the browser loads it, and it shows its data
 * or why it failed, with a button that tries again.
 */

export const Flaky = Page.define({
  path: '/flaky',
  render: 'client',
  data: Luck,
  metadata: about('/flaky', 'Flaky', 'A client page that fails half the time.'),
});

export const FlakyLive = Page.build(Flaky);
