import { PanelLeftOpenIcon } from '@kstackz/ui-toolkit/lucide';
import type { Topic } from '../../topic.ts';
import { Anywhere } from './anywhere.tsx';
import anywhere from './anywhere.tsx?raw';
import { EdgeOnly } from './edge-only.tsx';
import edgeOnly from './edge-only.tsx?raw';
import { Flick } from './flick.tsx';
import flick from './flick.tsx?raw';
import { RightSide } from './right-side.tsx';
import rightSide from './right-side.tsx?raw';

/** One sidebar: where it opens from, and how it settles. */
export const oneSidebar: Topic = {
  slug: 'one-sidebar',
  title: 'One sidebar',
  icon: PanelLeftOpenIcon,
  scenarios: [
    {
      slug: 'anywhere',
      sentence: 'A sidebar that opens from anywhere. Swipe right, then left.',
      Demo: Anywhere,
      source: anywhere,
      file: 'anywhere.tsx',
    },
    {
      slug: 'flick',
      sentence:
        'It settles by momentum. Flick right just a few px, then drag slowly halfway.',
      Demo: Flick,
      source: flick,
      file: 'flick.tsx',
    },
    {
      slug: 'right-side',
      sentence: 'A sidebar on the right. Swipe left to open it.',
      Demo: RightSide,
      source: rightSide,
      file: 'right-side.tsx',
    },
    {
      slug: 'edge-only',
      sentence:
        'It opens only from the left edge. Swipe right mid-screen, then from the edge.',
      Demo: EdgeOnly,
      source: edgeOnly,
      file: 'edge-only.tsx',
      fullScreen: true,
    },
  ],
};
