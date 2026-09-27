import type { Tutorial } from '../tutorial/index.ts';
import code from './gestures.ts?raw';

export const photosTutorial: Tutorial = {
  title: 'Photos',
  summary:
    'A photo viewer: page, zoom, move and dismiss, all with the photo following your fingers.',
  tryThis: [
    {
      gesture: 'Drag left or right',
      result:
        'The next or previous photo follows your finger. Release and it glides directly into place without bouncing.',
    },
    {
      gesture: 'Pinch',
      result:
        'Zooms around your fingers, up to 4×. Past that, or below fit, it gives like a rubber band and springs back.',
    },
    {
      gesture: 'Double tap',
      result: 'Zooms to where you tapped; double tap again to fit.',
    },
    {
      gesture: 'Zoomed in, drag with two fingers',
      result:
        'Moves the photo, coasting when you flick, stopping at its edges.',
    },
    {
      gesture: 'At fit, swipe down',
      result: 'The photo drops away and fades, then comes back.',
    },
    {
      gesture: 'On the first or last photo, drag outward',
      result:
        'It gives like a rubber band and eases back. The sidebar does not open: this zone wants the movement, so the lab never sees it.',
    },
  ],
  howItWorks: [
    'The viewer is a GestureZone with scroll="none": every movement here is the app\'s.',
    'Paging is a one-finger usePan along x with momentum disabled. Distance and release velocity choose at most one adjacent photo; a 240ms ease-out lands it exactly. Dismiss is a useSwipe down on the same finger.',
    'Both are one finger with no Hold. The rule is: a Swipe claims its own direction, and the Pan gets the rest. So a drag that starts downward dismisses, and anything else pages.',
    'Zoomed in, both are turned off (enabled: false) and a two-finger usePan moves the photo instead, within bounds read as each Pan starts.',
    "usePinch is given the Pan's x and y, so it moves the photo to keep the point under your fingers there.",
    'The double tap is useTap({ count: 2 }). No single tap is registered here, so nothing waits.',
  ],
  code,
  animation: [
    'scale, x and y are motion values on the current photo, transformed from its top left.',
    "The strip of photos is the paging Pan's x. It tracks the finger directly; on release, velocity can complete a short flick and distance can complete a slower drag.",
    'Paging uses a 240ms ease-out: fast at first, then smoothly decelerating into place. It deliberately has no spring or overshoot. Pinch and zoom still use springs because their physical bounds benefit from them.',
    "Dismiss drives the photo's offset, scale and opacity from one progress; its onSwipe promise holds it away for a moment before it springs home.",
  ],
};
