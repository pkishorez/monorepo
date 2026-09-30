import { distanceVsFlick } from './topics/distance-vs-flick/index.ts';
import { everything } from './topics/everything/index.ts';
import { fingerCount } from './topics/finger-count/index.ts';
import { fingers } from './topics/fingers/index.ts';
import { fromEdge } from './topics/from-edge/index.ts';
import { holdAndDrag } from './topics/hold-and-drag/index.ts';
import { oneSidebar } from './topics/one-sidebar/index.ts';
import { optingOut } from './topics/opting-out/index.ts';
import { pinch } from './topics/pinch/index.ts';
import { pullToRefresh } from './topics/pull-to-refresh/index.ts';
import { scrollVsGesture } from './topics/scroll-vs-gesture/index.ts';
import { sidebarScroll } from './topics/sidebar-scroll/index.ts';
import { swipeDirections } from './topics/swipe-directions/index.ts';
import { swipeRows } from './topics/swipe-rows/index.ts';
import { tabsAndSidebar } from './topics/tabs-and-sidebar/index.ts';
import { twoSidebars } from './topics/two-sidebars/index.ts';
import { whyCancelled } from './topics/why-cancelled/index.ts';
import { zones } from './topics/zones/index.ts';
import type { TopicGroup } from './topic.ts';

/** The sidebar, top to bottom. The first Topic is the Showcase's home. */
export const GROUPS: ReadonlyArray<TopicGroup> = [
  { label: 'Start', topics: [sidebarScroll] },
  {
    label: 'Foundations',
    topics: [zones, scrollVsGesture, optingOut, fingers],
  },
  {
    label: 'Swipe',
    topics: [
      swipeDirections,
      fingerCount,
      distanceVsFlick,
      fromEdge,
      whyCancelled,
    ],
  },
  {
    label: 'Patterns',
    topics: [oneSidebar, twoSidebars, pullToRefresh, swipeRows, tabsAndSidebar],
  },
  { label: 'Everything at once', topics: [everything] },
  { label: 'Built on fingers', topics: [pinch, holdAndDrag] },
];
