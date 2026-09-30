import { GaugeIcon } from '@kstackz/ui-toolkit/lucide';
import type { Topic } from '../../topic.ts';
import { Either } from './either.tsx';
import either from './either.tsx?raw';
import { FlickOnly } from './flick-only.tsx';
import flickOnly from './flick-only.tsx?raw';

/** What a Swipe needs at release to Commit: distance, velocity, or both. */
export const distanceVsFlick: Topic = {
  slug: 'distance-vs-flick',
  title: 'Distance vs flick',
  icon: GaugeIcon,
  scenarios: [
    {
      slug: 'either',
      sentence:
        'Commits at 80px or 500px/s. Drag right slowly past the line, then flick right a little.',
      Demo: Either,
      source: either,
      file: 'either.tsx',
    },
    {
      slug: 'flick-only',
      sentence: 'Only speed counts. Drag right slowly all the way, then flick.',
      Demo: FlickOnly,
      source: flickOnly,
      file: 'flick-only.tsx',
    },
  ],
};
