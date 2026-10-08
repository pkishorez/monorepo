# Swipes

Act when a finger swipes one way far or fast enough, and spring back when it doesn't.

`useSwipe` follows the fingers as they move, so your row or page can track them, and decides when they let go: past the distance or speed you set it commits, short of it it cancels and you spring back. [A short swipe springs back and a long one archives](web-platform/gestures/swipes/a-short-swipe-springs-back).

```tsx
const swipe = useSwipe({ direction: 'left', onCommit: remove });
```

That covers most of what people swipe: [a row to delete](web-platform/gestures/swipes/swipe-a-row-to-delete), [tabs to turn](web-platform/gestures/swipes/swipe-between-tabs) with one swipe each way, and [a sheet from the bottom edge](web-platform/gestures/swipes/swipe-up-from-the-bottom-edge) that starts only near the edge, even over a list that scrolls. You can also ask for more than one finger, so [only a two-finger swipe skips the track](web-platform/gestures/swipes/only-two-fingers-skip-the-track).
