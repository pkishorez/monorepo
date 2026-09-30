import { PanelLeftIcon } from '@kstackz/ui-toolkit/lucide';
import type { Topic } from '../../topic.ts';
import { Anywhere } from './anywhere.tsx';
import anywhere from './anywhere.tsx?raw';
import { Carousel } from './carousel.tsx';
import carousel from './carousel.tsx?raw';
import { EdgeOnly } from './edge-only.tsx';
import edgeOnly from './edge-only.tsx?raw';

/** A sidebar over a page that scrolls: who gets which touch. */
export const sidebarScroll: Topic = {
  slug: 'sidebar-scroll',
  title: 'Sidebar + scrolling page',
  icon: PanelLeftIcon,
  scenarios: [
    {
      slug: 'anywhere',
      sentence:
        'A long page, and a sidebar that opens from anywhere. Drag up or down, then sideways, then diagonally.',
      Demo: Anywhere,
      source: anywhere,
      file: 'anywhere.tsx',
    },
    {
      slug: 'carousel',
      sentence:
        'A carousel inside the page. Swipe it right at its start, then again after scrolling it.',
      Demo: Carousel,
      source: carousel,
      file: 'carousel.tsx',
    },
    {
      slug: 'edge-only',
      sentence:
        'The sidebar opens only from the left edge. Swipe right mid-screen, then from the edge.',
      Demo: EdgeOnly,
      source: edgeOnly,
      file: 'edge-only.tsx',
      fullScreen: true,
    },
  ],
};
