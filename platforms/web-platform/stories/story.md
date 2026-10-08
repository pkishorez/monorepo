# web-platform

Build touch screens for the web where swipes, drags and pinches work beside scrolling instead of fighting it.

On a phone, every touch is claimed by someone: the browser wants it for scrolling, a link wants it for a click, your carousel wants it for a swipe. Get it wrong and a list stops scrolling, or a row you meant to swipe scrolls the page.

You put one `GestureProvider` at the root, wrap each area that wants touch in a `GestureZone`, and call a hook inside it:

```tsx
useSwipe({ direction: 'right', onCommit: () => file(receipt) });
```

Your area takes the touches it asked for and the browser keeps the rest, so [rows swipe sideways while the list still scrolls](web-platform/rows-swipe-while-the-list-scrolls).

Everything a finger can do on your page lives in [gestures](web-platform/gestures): swipes, drags, long presses, pinches, ready-made sidebars and pull to refresh, and a menu you pick from with your thumb.
