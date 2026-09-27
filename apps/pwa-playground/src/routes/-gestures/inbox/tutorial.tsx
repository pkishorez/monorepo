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
        'The row has nothing to do with it, so it passes out to the lab and opens the sidebar.',
    },
  ],
  howItWorks: [
    'The feed is a GestureZone with scroll="y", and it is the scrolling element itself. The browser keeps one finger up and down for scrolling.',
    'Pull to refresh is useSwipe({ direction: "down" }) on that zone. A Swipe along the scroll axis is only claimed when the scroller is at its end that way: at the top, a finger moving down could not scroll anything anyway.',
    'Each row is its own nested GestureZone with useSwipe({ direction: "left", after: "stay" }). A touch belongs to the innermost zone it starts in.',
    "A gesture the row has no hook for passes outward: a pull down on a row reaches the feed, and a Swipe right on a closed row reaches the lab's sidebar.",
    'onSwipe returns a promise for the refresh, so only that pull-to-refresh driver waits. Row gestures and the sidebar remain available in parallel.',
  ],
  code,
  animation: [
    'Each Swipe has one progress value: 0 at rest, 1 at the full distance, set on every move.',
    "The list's offset, the arrow's turn, the indicator's fade and scale are all useTransforms of the pull's progress. \"Release to refresh\" is its armed value: 1 while letting go would commit.",
    "Dragging past an end uses rubber-banding: each extra pixel moves the surface less, like increasing friction. On release, velocity continuity starts the settle from the finger's current speed instead of visibly restarting.",
    'The settle is a bounce-free 500ms spring. After refresh the indicator returns home; a new independent gesture can begin while that work finishes.',
    "A row's content slides by its progress; the actions fade in behind it. Touch a row mid-settle and it stops under your finger, ready for the next drag.",
  ],
};
