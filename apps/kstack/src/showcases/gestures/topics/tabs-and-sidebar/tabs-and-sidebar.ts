import { GalleryHorizontalIcon } from '@kstackz/ui-toolkit/lucide';
import type { Topic } from '../../topic.ts';
import { EdgeSidebar } from './edge-sidebar.tsx';
import edgeSidebar from './edge-sidebar.tsx?raw';
import { FirstTab } from './first-tab.tsx';
import firstTab from './first-tab.tsx?raw';
import { TabsWithScroll } from './tabs-with-scroll.tsx';
import tabsWithScroll from './tabs-with-scroll.tsx?raw';

/** Tabs you swipe between, beside a sidebar that also opens from a Swipe right. */
export const tabsAndSidebar: Topic = {
  slug: 'tabs-and-sidebar',
  title: 'Tabs + sidebar',
  icon: GalleryHorizontalIcon,
  scenarios: [
    {
      slug: 'first-tab',
      sentence:
        'On the first tab, a Swipe right opens the sidebar. On the others, it goes back a tab.',
      Demo: FirstTab,
      source: firstTab,
      file: 'first-tab.tsx',
    },
    {
      slug: 'edge-sidebar',
      sentence:
        'The sidebar opens only from the left edge. Swipe right mid-screen, then from the edge.',
      Demo: EdgeSidebar,
      source: edgeSidebar,
      file: 'edge-sidebar.tsx',
      fullScreen: true,
    },
    {
      slug: 'tabs-with-scroll',
      sentence:
        'Each tab scrolls. Drag up and down, then sideways, then diagonally.',
      Demo: TabsWithScroll,
      source: tabsWithScroll,
      file: 'tabs-with-scroll.tsx',
    },
  ],
};
