import type { Tutorial } from '../tutorial/index.ts';
import code from './gestures.ts?raw';

export const inboxTutorial: Tutorial = {
  title: 'Inbox',
  summary:
    'A scrolling feed: pull down at the top to refresh, swipe a row left for its actions.',
  tryThis: [
    {
      gesture: 'Scroll up and down',
      result: 'The feed scrolls natively, as any page would.',
    },
    {
      gesture: 'At the very top, pull down',
      result:
        'The arrow turns and the list follows your finger. Past the line it says "Release to refresh"; let go and new messages arrive at the top.',
    },
    {
      gesture: 'Pull down in the middle of the feed',
      result:
        'It just scrolls: the refresh only claims the pull when the feed cannot scroll up any more.',
    },
    {
      gesture: 'Swipe a row left',
      result:
        'It slides open to Archive and Delete, and stays open. Opening another row closes this one.',
    },
    { gesture: 'Swipe an open row right, or tap it', result: 'It closes.' },
    {
      gesture: 'Swipe a closed row right',
      result:
        'The row has nothing to do with it, so it passes out to the lab, which opens the sidebar (where the browser owns the screen edge).',
    },
  ],
  howItWorks: [
    'The feed is a GestureZone with scroll="y", and it is the scrolling element itself. The browser keeps one finger up and down for scrolling.',
    'Pull to refresh is useSwipe({ direction: "down" }) on that zone. A Swipe along the scroll axis is only claimed when the scroller is at its end that way: at the top, a finger moving down could not scroll anything anyway.',
    'Each row is its own nested GestureZone with useSwipe({ direction: "left", after: "stay" }). A touch belongs to the innermost zone it starts in.',
    "A gesture the row has no hook for passes outward: a pull down on a row reaches the feed, and a Swipe right on a closed row reaches the lab's sidebar.",
    'onSwipe returns a promise for the refresh, and the indicator holds open until it settles.',
  ],
  code,
  animation: [
    'Each Swipe has one progress value: 0 at rest, 1 at the full distance, set on every move.',
    "The list's offset, the arrow's turn, the indicator's fade and scale are all useTransforms of the pull's progress. \"Release to refresh\" is its armed value: 1 while letting go would commit.",
    "On release the progress springs to 1 or back to 0, starting at your finger's speed. After the refresh it springs home.",
    "A row's content slides by its progress; the actions fade in behind it. Touch a row mid-spring and it stops under your finger.",
  ],
};
