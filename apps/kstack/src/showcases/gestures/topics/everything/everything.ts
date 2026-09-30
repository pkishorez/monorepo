import { LayersIcon } from '@kstackz/ui-toolkit/lucide';
import type { Topic } from '../../topic.ts';
import { EdgeLeft } from './edge-left.tsx';
import edgeLeft from './edge-left.tsx?raw';
import { OneScreen } from './one-screen.tsx';
import oneScreen from './one-screen.tsx?raw';

/** Every gesture on one screen, as a real app would have them. */
export const everything: Topic = {
  slug: 'everything',
  title: 'Everything at once',
  icon: LayersIcon,
  scenarios: [
    {
      slug: 'one-screen',
      sentence:
        'Two sidebars, pull to refresh, swipe rows, a carousel and scrolling. Try them all.',
      Demo: OneScreen,
      source: oneScreen,
      file: 'one-screen.tsx',
      fullScreen: true,
    },
    {
      slug: 'edge-left',
      sentence:
        'The same inbox, with the menu only from the left edge. Swipe right mid-screen, then from the edge.',
      Demo: EdgeLeft,
      source: edgeLeft,
      file: 'edge-left.tsx',
      fullScreen: true,
    },
  ],
};
