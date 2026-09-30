import { MailIcon } from '@kstackz/ui-toolkit/lucide';
import { codeFiles, type Feature } from '../feature.ts';
import { MailApp } from './app.tsx';

/** A mail inbox: two sidebars, pull to refresh, swipeable rows and a mail that swipes back. */
export const mail: Feature = {
  slug: 'mail',
  title: 'Mail',
  icon: MailIcon,
  tries: [
    'Swipe right on a row: it toggles read. Swipe right on the header or from the left edge: the folders open.',
    'Swipe a row left past halfway: it archives at once and collapses, with Undo.',
    'Swipe a row left a little: its actions stay open. Touch another row: it only shuts.',
    'With a row open, swipe it either way: it follows, and nothing behind it moves.',
    'Swipe left from the right edge, even over a row: the filters open, not the row.',
    'Pull down at the top: new mail arrives. Scroll down and pull again: it only scrolls.',
    'Start scrolling, then swipe sideways: the scroll keeps the touch.',
    'Open a mail and swipe right mid-screen: nothing. From the left edge: it follows you back.',
  ],
  App: MailApp,
  files: codeFiles(
    'mail',
    import.meta.glob('./*.{ts,tsx}', {
      query: '?raw',
      import: 'default',
      eager: true,
    }),
  ),
};
