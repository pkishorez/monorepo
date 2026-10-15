import { Route } from '@kestack/kabuki/routing';
import { about } from '../data/index.ts';

/*
 * A board that pans in both directions, whose page says `scroll: false`:
 * Kabuki never remembers or moves it, so it opens at its corner every time.
 */

export const Canvas = Route.page({
  path: '/canvas',
  scroll: false,
  metadata: about('/canvas', 'Canvas', 'A Scroll area Kabuki never touches.'),
}).build({});
