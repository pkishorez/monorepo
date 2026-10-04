# The mouse never makes a Gesture

The Gesture Provider listened to every pointer, and a left-button mouse drag started a Gesture like a finger. But what makes touch work in a zone never applies to a mouse: `touch-action`, the first `touchmove` that decides who owns a touch, Native Scroll and the guard on the screen edges are all touch-only. A mouse drag selects text instead of scrolling, so in the demos a drag on a list both selected text and swiped, a pull to refresh started from a click, and a release after a short drag clicked unless the app prevented it. A trackpad swipe sends wheel events, which the package never hears, so a desktop user could not swipe with it anyway.

Now only touch and pen pointers start a Gesture. A mouse pointer is left to the browser, as if no zone were there: it selects, drags and clicks as usual. A pen counts as a finger: on a touchscreen the browser applies `touch-action` to it too, and a swipe with a stylus should open a sidebar. Where a pen sends no touch events, the Direction is still read once it has moved 10px.

## Considered Options

- **Turn the whole package off on desktop devices**, from `(pointer: coarse)`, the screen size or the user agent: rejected. Touchscreen laptops, tablets with a trackpad and Surface devices have both kinds of pointer, so a device test either breaks touch on a touch laptop or keeps the mouse problems on a tablet. The pointer type is exact for each input on every device and needs no detection.
- **A `GestureProvider` option to let the mouse in**: left out until an app needs one, such as a board that reorders cards by dragging. Browser devtools emulate touch, so testing on a desktop does not need it.
- **Tell the app whether touch is possible**, so it can show buttons instead: rejected. That is the app's own responsive layout; on a desktop, visible controls and the keyboard do the work, and a Pattern that never hears a touch does no harm.

## Consequences

- On a desktop with a mouse, every Pattern and Recognizer stays quiet; the app gives the same actions another way, such as a button or a keyboard shortcut.
- A mouse release never needs `preventClick()`.
- A test that dispatches pointer events must set `pointerType` to `touch` or `pen`.
