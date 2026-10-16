import type { RenderMode } from '@kestack/kabuki/routing';
import { router } from '../../shared/index.ts';
import type { Place } from '../../shared/index.ts';

/*
 * How each Render Mode is shown: its word, what it means in a line, and its
 * color, the only three colors the site adds.
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

/** A place's Render Mode, as its pages say. */
export const modeOf = (place: Place): RenderMode =>
  router.every.find((each) => each.name === place)?.render ?? 'static';
