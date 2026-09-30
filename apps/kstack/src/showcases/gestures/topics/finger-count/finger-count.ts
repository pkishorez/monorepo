import { HandIcon } from '@kstackz/ui-toolkit/lucide';
import type { Topic } from '../../topic.ts';
import { Range } from './range.tsx';
import range from './range.tsx?raw';
import { ThreeSwipes } from './three-swipes.tsx';
import threeSwipes from './three-swipes.tsx?raw';

/** How many fingers a Swipe takes: exactly some, or a range. */
export const fingerCount: Topic = {
  slug: 'finger-count',
  title: 'Finger count',
  icon: HandIcon,
  scenarios: [
    {
      slug: 'three-swipes',
      sentence:
        'Three Swipes left: one, two and three fingers. Swipe left with each count.',
      Demo: ThreeSwipes,
      source: threeSwipes,
      file: 'three-swipes.tsx',
      touchOnly: true,
    },
    {
      slug: 'range',
      sentence:
        'A Swipe up for two or three fingers. Try one, two, three, then four.',
      Demo: Range,
      source: range,
      file: 'range.tsx',
      touchOnly: true,
    },
  ],
};
