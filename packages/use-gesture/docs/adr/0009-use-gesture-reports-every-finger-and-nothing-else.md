---
status: partly superseded by ADR-0012 (who keeps a Gesture)
---

# useGesture reports every finger; zones nest and pass Gestures up

The zone built its own meanings on top of the fingers: a Hold from the bottom-left corner, a Pan, a one-finger Swipe, a Tap, and a movement, scale and rotation for the whole Gesture. Each meaning needed rules against the others, such as a press timer so the Hold would not break pinching, and an app could not add one of its own: a two-finger swipe down, or a tap with a fourth finger during a three-finger swipe, was impossible to express. And there was one zone per screen, so a card could not have Gestures of its own.

Now the block reports fingers and nothing else, and `useGesture` is its only hook. A Gesture runs from the first finger landing to the last one lifting, and every finger that lands in between is a Pointer in it: where, when and on what it landed, motion values for where it is now and how far it has moved, and where and when it lifted. A lifted finger stays in the Gesture until it ends, so `onEnd` sees all of them. Callbacks fire only as the Gesture starts, as a finger lands or lifts, and as it ends; movement is read from the motion values. Pan, swipe, pinch, rotation and holds become helpers that read Pointers.

One `GestureProvider`, usually at the app's root, follows every finger and runs the one Gesture under way. `GestureZone`s mark the areas where the app owns touch, and nest. The first finger decides who hears a Gesture: the innermost zone under it, then each zone around it, up to and including the first `trapped` one. Every enabled `useGesture` in those zones gets it. Later fingers join wherever they land, and sibling zones never hear each other. `trapped` is false by default and is read as each Gesture starts, so a zone can trap while, say, its own options are open. Which of the hooks that hear a Gesture act on it is the app's state: `enabled`, and what each handler checks.

The block does not decide whether a touch clicks what is under it either. The browser does, as it would outside a zone, and the app can stop it with `preventClick()` in `onEnd`. The one rule the block keeps is that a finger lifting while others stay down never clicks, since `onEnd` comes too late to stop that click.

Supersedes ADR 0007 and ADR 0008, the Hold in ADR 0005, and the Swipe, whole-Gesture values and one zone per screen in ADR 0004.

## Considered Options

- **Keep the Hold, Pan and Swipe hooks beside a lower-level one**: rejected. They would each need their own rules against the others, and one screen could not combine their readings in one place.
- **Callbacks for every movement, or the map as React state**: rejected. Motion values follow fingers without re-rendering, and give velocity for free.
- **Dropping a finger from the map as it lifts**: rejected. `onEnd` would then see nothing, and gestures like a two-finger swipe are judged when fingers lift.
- **The block decides clicks from a Tap: one finger, lifted within 250ms, moved under 8px**: rejected. It put one meaning back into a block that reports only fingers, and its thresholds fought the app's own readings, such as a press on the Hold corner that clicked the tab bar under it.
- **Swallow every click and let the app allow one**: rejected. Every button and link inside a zone would break until the app wired it.
- **The innermost zone alone owns a Gesture**: rejected. A card's swipe left and the sidebar's swipe right often start on the same card; passing Gestures up, and trapping them when the child must keep them, lets each decide.
- **Each zone binding its own page listeners, or a module-level router**: rejected. Zones could not agree on who has a finger without shared state; the provider is that state, owned by React rather than hidden.
- **A `ref` option on `useGesture`, for a zone without a component**: rejected. `GestureZone` takes every div prop, so it can be the element itself, and one way to make a zone keeps the model to "a hook belongs to its nearest zone".
- **A list of zones in the provider**: rejected. Zones are marked in the DOM, so the walk up is `closest()` from the finger's target.

## Consequences

- A Hold is no longer the block's. An app that wants one reads it from Pointers, such as one finger still while another moves, and resolves the ambiguity with pinching itself.
- There is no Tap in the block. An app that wants one reads it from Pointers.
- Whether a long still press clicks is each browser's own rule, and a mouse drag released where it started clicks; an app that must not click calls `preventClick()`.
- Blocking the browser still happens on each zone's own element: a blocking touch listener on the whole page would make every scroll wait.
- A zone inside a portal still reaches its provider through React, but hears only fingers that land in it in the DOM.
- Two providers each run their own Gesture, so two hands in two of their zones make two Gestures; within one provider there is one at a time.
- An element that uses Framer Motion's own gestures inside a zone is marked `data-zone-gesture="disabled"`; otherwise both react to the same touch.
- The Gesture Lab is a placeholder until its demo is rebuilt on `useGesture`.
