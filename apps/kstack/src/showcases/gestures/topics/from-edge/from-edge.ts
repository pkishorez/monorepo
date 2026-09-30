import { ArrowRightFromLineIcon } from '@kstackz/ui-toolkit/lucide';
import type { Topic } from '../../topic.ts';
import { BottomEdge } from './bottom-edge.tsx';
import bottomEdge from './bottom-edge.tsx?raw';
import { LeftEdge } from './left-edge.tsx';
import leftEdge from './left-edge.tsx?raw';
import { RightEdge } from './right-edge.tsx';
import rightEdge from './right-edge.tsx?raw';

/** A Swipe that counts only when it starts at a screen edge. */
export const fromEdge: Topic = {
  slug: 'from-edge',
  title: 'From the edge',
  icon: ArrowRightFromLineIcon,
  scenarios: [
    {
      slug: 'left',
      sentence:
        'Only a Swipe right from the left edge counts. Swipe mid-screen, then from the strip.',
      Demo: LeftEdge,
      source: leftEdge,
      file: 'left-edge.tsx',
      fullScreen: true,
    },
    {
      slug: 'right',
      sentence:
        'Only a Swipe left from the right edge counts. Swipe mid-screen, then from the strip.',
      Demo: RightEdge,
      source: rightEdge,
      file: 'right-edge.tsx',
      fullScreen: true,
    },
    {
      slug: 'bottom',
      sentence:
        'A home bar: only a Swipe up from the bottom strip counts. Try it beside the pill.',
      Demo: BottomEdge,
      source: bottomEdge,
      file: 'bottom-edge.tsx',
      fullScreen: true,
    },
  ],
};
