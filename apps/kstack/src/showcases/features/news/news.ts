import { NewspaperIcon } from '@kstackz/ui-toolkit/lucide';
import { codeFiles, type Feature } from '../feature.ts';
import { NewsApp } from './app.tsx';

/** A news reader: tabs, rows, two sidebars and an article all wanting a sideways swipe. */
export const news: Feature = {
  slug: 'news',
  title: 'News',
  icon: NewspaperIcon,
  tries: [
    'Drag slowly between tabs: the underline follows your finger, and letting go short stays put.',
    'On Top, swipe right anywhere: the sections sidebar opens, as there is no tab before it.',
    'On World, swipe right mid-screen: back to Top; from the left edge: the sidebar opens.',
    'Swipe an article left: it is saved and shows in the right sidebar; swipe it again to unsave.',
    'Swipe left on the tab bar instead: the next tab, since articles take a left swipe.',
    'Swipe left from the right edge, even over an article: the saved sidebar opens, nothing is saved.',
    'Pull down at the top of a tab: only that tab refreshes, and a new story slides in.',
    'Open an article and swipe right from the left edge: it follows your finger back to the feed.',
  ],
  App: NewsApp,
  files: codeFiles(
    'news',
    import.meta.glob('./*.{ts,tsx}', {
      query: '?raw',
      import: 'default',
      eager: true,
    }),
  ),
};
