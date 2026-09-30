import { Rows3Icon } from '@kstackz/ui-toolkit/lucide';
import type { Topic } from '../../topic.ts';
import { FullSwipe } from './full-swipe.tsx';
import fullSwipe from './full-swipe.tsx?raw';
import { OneAtATime } from './one-at-a-time.tsx';
import oneAtATime from './one-at-a-time.tsx?raw';
import { Reveal } from './reveal.tsx';
import reveal from './reveal.tsx?raw';
import { RowsScrollSidebar } from './rows-scroll-sidebar.tsx';
import rowsScrollSidebar from './rows-scroll-sidebar.tsx?raw';
import { OpenRowAndSidebar } from './open-row-and-sidebar.tsx';
import openRowAndSidebar from './open-row-and-sidebar.tsx?raw';

/** Rows that swipe open to their actions, built from Swipes: each row is its own zone. */
export const swipeRows: Topic = {
  slug: 'swipe-rows',
  title: 'Swipe rows',
  icon: Rows3Icon,
  scenarios: [
    {
      slug: 'reveal',
      sentence:
        'Each row is a zone. Swipe one left to open it, then right to close it.',
      Demo: Reveal,
      source: reveal,
      file: 'reveal.tsx',
    },
    {
      slug: 'open-row-and-sidebar',
      sentence:
        'An open row takes its closing swipe. Open one, swipe it right, then swipe right on a closed row.',
      Demo: OpenRowAndSidebar,
      source: openRowAndSidebar,
      file: 'open-row-and-sidebar.tsx',
    },
    {
      slug: 'one-at-a-time',
      sentence:
        'Open one row, then touch or swipe another: the first one shuts.',
      Demo: OneAtATime,
      source: oneAtATime,
      file: 'one-at-a-time.tsx',
    },
    {
      slug: 'full-swipe',
      sentence:
        'Swipe a row left past 60% and let go: it archives. Stop short: it opens.',
      Demo: FullSwipe,
      source: fullSwipe,
      file: 'full-swipe.tsx',
    },
    {
      slug: 'rows-scroll-sidebar',
      sentence:
        'Rows, scrolling and a sidebar together. Scroll, swipe a row left, then swipe right.',
      Demo: RowsScrollSidebar,
      source: rowsScrollSidebar,
      file: 'rows-scroll-sidebar.tsx',
    },
  ],
};
