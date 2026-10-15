import type { RenderMode, ScrollMode } from '@kestack/kabuki/routing';
import { Routes, scrollOf } from '../../shared/index.ts';
import type { Place } from '../../shared/index.ts';

/*
 * How each Render Mode and scroll mode is shown: its word, what it means in
 * a line, and, for a Render Mode alone, its color. Scroll modes stay grey:
 * three colors are all the site adds.
 */

export const MODE: Readonly<
  Record<
    RenderMode,
    {
      readonly what: string;
      readonly text: string;
      readonly dot: string;
      readonly edge: string;
    }
  >
> = {
  static: {
    what: 'drawn once per deploy and kept at the edge; its copy in the browser is never loaded again',
    text: 'text-static',
    dot: 'bg-static',
    edge: 'border-l-static',
  },
  dynamic: {
    what: 'drawn for each request; its copy shows at once on the way back, and loads again behind it',
    text: 'text-dynamic',
    dot: 'bg-dynamic',
    edge: 'border-l-dynamic',
  },
  client: {
    what: 'sent loading; the browser loads its data once the app runs',
    text: 'text-client',
    dot: 'bg-client',
    edge: 'border-l-client',
  },
};

export type Scroll = 'entry' | 'url' | 'off';

export const SCROLL: Readonly<Record<Scroll, string>> = {
  entry:
    'Back and Forward put it where it was on that entry; a new entry starts at the top',
  url: 'any way back, a link too, finds it where it was left',
  off: 'never remembered, never moved',
};

const scrollName = (mode: ScrollMode): Scroll =>
  mode === false ? 'off' : mode;

/** A place's Render Mode and scroll mode, as its pages say. */
export const modesOf = (place: Place) => ({
  render: Routes.every.find((each) => each.name === place)?.render ?? 'static',
  scroll: scrollName(scrollOf(place)),
});
