import { RefreshCwIcon } from '@kstackz/ui-toolkit/lucide';
import type { Topic } from '../../topic.ts';
import { Disarm } from './disarm.tsx';
import disarm from './disarm.tsx?raw';
import { Plain } from './plain.tsx';
import plain from './plain.tsx?raw';
import { Scrolled } from './scrolled.tsx';
import scrolled from './scrolled.tsx?raw';
import { SlowRefresh } from './slow-refresh.tsx';
import slowRefresh from './slow-refresh.tsx?raw';
import { WithSidebar } from './with-sidebar.tsx';
import withSidebar from './with-sidebar.tsx?raw';

/** Pull a list down to refresh it: when it arms, when it doesn't start. */
export const pullToRefresh: Topic = {
  slug: 'pull-to-refresh',
  title: 'Pull to refresh',
  icon: RefreshCwIcon,
  scenarios: [
    {
      slug: 'plain',
      sentence:
        'A list at its top. Pull down until the arrow flips, then let go.',
      Demo: Plain,
      source: plain,
      file: 'plain.tsx',
    },
    {
      slug: 'scrolled',
      sentence:
        'The list starts scrolled down. Pull down: it scrolls. At the top, pull again.',
      Demo: Scrolled,
      source: scrolled,
      file: 'scrolled.tsx',
    },
    {
      slug: 'disarm',
      sentence:
        'Pull until it arms, push back up, then let go: nothing refreshes.',
      Demo: Disarm,
      source: disarm,
      file: 'disarm.tsx',
    },
    {
      slug: 'with-sidebar',
      sentence:
        'Pull to refresh and a sidebar from anywhere. Drag diagonally down and right.',
      Demo: WithSidebar,
      source: withSidebar,
      file: 'with-sidebar.tsx',
    },
    {
      slug: 'slow-refresh',
      sentence: 'A refresh that takes three seconds. Pull again while it runs.',
      Demo: SlowRefresh,
      source: slowRefresh,
      file: 'slow-refresh.tsx',
    },
  ],
};
