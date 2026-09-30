import { CircleSlashIcon } from '@kstackz/ui-toolkit/lucide';
import type { Topic } from '../../topic.ts';
import { LateFinger } from './late-finger.tsx';
import lateFinger from './late-finger.tsx?raw';
import { Reasons } from './reasons.tsx';
import reasons from './reasons.tsx?raw';
import { Scroller } from './scroller.tsx';
import scroller from './scroller.tsx?raw';

/** The four ways a Swipe Cancels, and what causes each. */
export const whyCancelled: Topic = {
  slug: 'why-cancelled',
  title: 'Why it cancelled',
  icon: CircleSlashIcon,
  scenarios: [
    {
      slug: 'reasons',
      sentence:
        'A Swipe right. Swipe up, use two fingers, or drag a little and let go.',
      Demo: Reasons,
      source: reasons,
      file: 'reasons.tsx',
    },
    {
      slug: 'late-finger',
      sentence:
        'Swipe right with one finger, then land a second one mid-swipe.',
      Demo: LateFinger,
      source: lateFinger,
      file: 'late-finger.tsx',
      touchOnly: true,
    },
    {
      slug: 'scroller',
      sentence:
        'A Swipe down with a list inside. Swipe down on the left, then scroll the list and swipe down on it.',
      Demo: Scroller,
      source: scroller,
      file: 'scroller.tsx',
      touchOnly: true,
    },
  ],
};
