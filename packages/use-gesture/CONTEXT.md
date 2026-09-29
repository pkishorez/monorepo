# Use Gesture

Touch gestures for React: every finger of a touch, read in nested areas that own touch, and the meanings built on top of it.

## Language

### Core

**Gesture Provider**:
The one place that follows every finger for the Gesture Zones inside it and runs the one Gesture under way. An app usually has one at its root; separate sections may each have their own, each with its own Gesture.
_Avoid_: router, tracker, root zone

**Gesture Zone**:
An area where the app, not the browser, owns touch, for gestures such as opening a sidebar, pulling to refresh, swiping a row or pinching a card. Zones nest and sit side by side. A Gesture that starts in a zone is heard by it and by each zone around it, up to the first Trapped one; sibling zones never hear each other. Any part of the app inside a zone, even one hidden right now, can listen to what it hears.
_Avoid_: touch area, gesture surface, hit area, provider (that is the Gesture Provider)

**Trapped**:
A Gesture Zone whose Gestures go no further: the zones around it do not hear what starts inside it. A zone is not Trapped unless the app says so, and it may be Trapped only for a while, such as while its own options are open.
_Avoid_: isolated, captured, exclusive

**Native Scroll**:
An element inside a Gesture Zone that can scroll right now, whose scrolling the browser keeps. The choice is made at a touch's first movement: when it is one finger and an element under it can still scroll that way, the browser keeps the touch until every finger lifts, even when it reaches the end, and the Gesture it started ends as interrupted. At its end that way, or with two fingers down before the first movement, the zone captures the touch instead. Only elements between the finger and the innermost zone around it count. An element where the zone is turned on always gives its scrolling up to the zone.
_Avoid_: scroller, scroll container, overflow

**Capture**:
A Gesture Zone taking a touch from the browser at its first movement, so nothing scrolls or zooms until every finger lifts. By default the zone captures every touch except one a Native Scroll keeps. Any element inside can turn the zone off for itself and what it holds — the zone then never takes a touch there — or turn it back on, which captures every touch there even over a Native Scroll. The nearest such element decides. A listener can do the same for touches landing where it listens, such as a Swipe from an edge. A zone also keeps touches landing at a side edge of the screen from the browser's own edge swipe, except on what must still click.
_Avoid_: grab, prevent scroll, dead zone

**Gesture**:
One continuous touch, from the first finger landing in a Gesture Zone to the last one lifting. Every finger that lands in between, wherever it lands, is one of its Pointers; a Gesture Provider runs one Gesture at a time. The core never classifies it: it reports only its Pointers, and what it means — a pan, a pinch, a two-finger swipe, one finger holding while another moves — is decided by a Recognizer or by the app that reads it. Whether its release also clicks what is under it is the browser's call, unless the app prevents its click.
_Avoid_: pan, pinch, swipe, tap, hold (meanings read from a Gesture), drag (moving an element itself), shortcut (a Gesture an app binds to a command), interaction

**Interrupted**:
How a Gesture ends when the browser takes its touch — a Native Scroll, a system back gesture, an incoming call — or the page loses focus: at once, with every finger lifted where it was.
_Avoid_: aborted, lost

**Pointer**:
One finger of a Gesture: where, when and on what element it landed, counted from the Gesture's start, where it is now and how far it has moved, and where and when it lifted. A lifted Pointer stays part of the Gesture until the Gesture ends.
_Avoid_: touch, finger (outside plain speech), contact

**Active**:
A Gesture listener while a Gesture it reads is under way; it stops being Active when the last finger lifts. A listener that is not enabled is never Active.
_Avoid_: dragging, pressed, engaged

### Recognizers

**Recognizer**:
One generic meaning read from a Gesture, such as a Swipe, with filters on direction, finger count and where it starts. It is Possible from the first finger, Tracking once it is sure enough to give feedback, and ends in a Commit or a Cancel. Recognizers never know about each other: when two hear the same Gesture, both may Commit, and the app keeps them apart with zones, Trapped and whether each is enabled.
_Avoid_: detector, handler, interaction, pattern

**Commit**:
A Recognizer deciding, as the Gesture ends, that its meaning happened. Before that, it can say at every moment whether letting go now would Commit, so the UI can show it.
_Avoid_: recognized, success, fire, trigger

**Cancel**:
A Recognizer giving up on a Gesture, with a reason: the wrong direction or finger count, too short or too slow at release, or the Gesture Interrupted. It happens as early as the Recognizer can tell.
_Avoid_: fail, abort, reject

**Swipe**:
The Recognizer for fingers moving one way — up, down, left or right — with a set finger count. It follows the fingers while Tracking and Commits at release on distance or speed. A flick is a Swipe that Commits on speed alone.
_Avoid_: flick (a Swipe setting, not its own Recognizer), pan (movement in any direction), drag

### Patterns

**Pattern**:
One purpose-built touch behaviour an app uses as it is, such as a sidebar or pull to refresh, built from Recognizers. It gives exactly the values its UI needs and settles itself when the Gesture ends. It knows nothing of where the app runs; the Native block decides when it is on.
_Avoid_: component, widget, preset
