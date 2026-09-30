import { HandGrabIcon } from '@kstackz/ui-toolkit/lucide';
import type { Topic } from '../../topic.ts';
import { HoldToLift } from './hold-to-lift.tsx';
import holdToLift from './hold-to-lift.tsx?raw';
import { HoldVsScroll } from './hold-vs-scroll.tsx';
import holdVsScroll from './hold-vs-scroll.tsx?raw';
import { SelectRange } from './select-range.tsx';
import selectRange from './select-range.tsx?raw';

/** A finger that holds still before, or while, something moves. */
export const holdAndDrag: Topic = {
  slug: 'hold-and-drag',
  title: 'Hold and drag',
  icon: HandGrabIcon,
  scenarios: [
    {
      slug: 'select-range',
      sentence:
        'Hold one finger still on a row, then drag a second finger over the others.',
      Demo: SelectRange,
      source: selectRange,
      file: 'select-range.tsx',
      touchOnly: true,
    },
    {
      slug: 'hold-to-lift',
      sentence:
        'Hold a tile still until it lifts, then drag it. Now drag one right away.',
      Demo: HoldToLift,
      source: holdToLift,
      file: 'hold-to-lift.tsx',
    },
    {
      slug: 'hold-vs-scroll',
      sentence:
        'A list. Drag it quickly to scroll, then hold a row still until it lifts.',
      Demo: HoldVsScroll,
      source: holdVsScroll,
      file: 'hold-vs-scroll.tsx',
    },
  ],
};
