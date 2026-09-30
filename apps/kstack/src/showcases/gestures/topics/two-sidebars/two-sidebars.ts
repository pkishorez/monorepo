import { Columns3Icon } from '@kstackz/ui-toolkit/lucide';
import type { Topic } from '../../topic.ts';
import { BothAnywhere } from './both-anywhere.tsx';
import bothAnywhere from './both-anywhere.tsx?raw';
import { Mixed } from './mixed.tsx';
import mixed from './mixed.tsx?raw';
import { TowardOther } from './toward-other.tsx';
import towardOther from './toward-other.tsx?raw';
import { WithScroll } from './with-scroll.tsx';
import withScroll from './with-scroll.tsx?raw';

/** A sidebar on each side: which one a Swipe opens. */
export const twoSidebars: Topic = {
  slug: 'two-sidebars',
  title: 'Two sidebars',
  icon: Columns3Icon,
  scenarios: [
    {
      slug: 'both-anywhere',
      sentence:
        'A sidebar on each side, both from anywhere. Swipe right, close it, then swipe left.',
      Demo: BothAnywhere,
      source: bothAnywhere,
      file: 'both-anywhere.tsx',
    },
    {
      slug: 'toward-other',
      sentence:
        'The left one is open. Swipe left: it closes, and the right one stays shut.',
      Demo: TowardOther,
      source: towardOther,
      file: 'toward-other.tsx',
    },
    {
      slug: 'mixed',
      sentence:
        'Left from the edge, right from anywhere. Swipe right mid-screen, then from the edge.',
      Demo: Mixed,
      source: mixed,
      file: 'mixed.tsx',
      fullScreen: true,
    },
    {
      slug: 'with-scroll',
      sentence:
        'Two sidebars over a long page. Scroll it, then swipe either way.',
      Demo: WithScroll,
      source: withScroll,
      file: 'with-scroll.tsx',
    },
  ],
};
