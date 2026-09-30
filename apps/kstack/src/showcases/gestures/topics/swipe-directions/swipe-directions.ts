import { MoveIcon } from '@kstackz/ui-toolkit/lucide';
import type { Topic } from '../../topic.ts';
import { FlyOff } from './fly-off.tsx';
import flyOff from './fly-off.tsx?raw';
import { FourWays } from './four-ways.tsx';
import fourWays from './four-ways.tsx?raw';

/** A Swipe's direction: how it locks, tracks and decides. */
export const swipeDirections: Topic = {
  slug: 'swipe-directions',
  title: 'Directions',
  icon: MoveIcon,
  scenarios: [
    {
      slug: 'four-ways',
      sentence:
        'Four Swipes, one per direction. Drag any way until it says release.',
      Demo: FourWays,
      source: fourWays,
      file: 'four-ways.tsx',
    },
    {
      slug: 'fly-off',
      sentence:
        'A card on a Swipe left and right. Fling it, then drag it a little and let go.',
      Demo: FlyOff,
      source: flyOff,
      file: 'fly-off.tsx',
    },
  ],
};
