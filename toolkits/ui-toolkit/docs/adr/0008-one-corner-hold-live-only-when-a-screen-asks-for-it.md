# One corner Hold, live only when a screen asks for it

A still finger anywhere became a left or right Hold when another finger acted beside it (ADR 0007). That broke pinching: in a real pinch the thumb barely moves, which is exactly a Hold beside a moving finger, and no threshold on movement can tell them apart. Now there is one Hold, from a quarter circle on the bottom-left corner. It is live only while some enabled listener takes Gestures under it, so a screen with no use for it keeps the corner as ordinary screen. On a screen with only one-finger listeners (`usePan`, `useSwipe`, `useTap`), the Hold starts the moment another finger lands beside the corner finger. On a screen that also pinches or rotates with `useGesture`, the corner finger must press still for 200ms, shown by a filling ring and confirmed by a short vibration on Android or a soft click on iOS, so fingers landing together stay a pinch. Until the Hold starts, the corner finger is ordinary: a quick lift, under 200ms, is a Tap that clicks, and a movement is a Gesture. A longer press lifted alone is nothing, so holding the corner over a button never clicks it.

`usePan` is new, so a screen can say it needs one finger only; `useGesture` stays the two-finger transform. `hold` on a listener is now a boolean.

Supersedes ADR 0007's rule for how a Hold starts; its state machine stands.

## Considered Options

- **A Hold from any still finger** (ADR 0007): rejected, because a pinch with a still thumb became a Hold.
- **A lead time everywhere**: rejected, because a one-finger screen would wait for nothing.
- **Enforcing one-finger screens whenever a Hold listener is enabled**: rejected. The zone cannot tell whether a `useGesture` reads scale, so the split is advice, and `usePan` makes it explicit.
- **No Hold**: rejected; apps want a second set of shortcuts.

## Consequences

- The same corner behaves differently between screens: at once on one-finger screens, after a press where pinching exists. The glow and ring show which, as a finger lands.
- Only a pressed Hold is confirmed, since the instant one needs no wait to be told about. Android vibrates; iOS Safari has no haptics for the web, so it clicks instead. Browsers start sound only as a finger lifts, so the click is unlocked by an earlier touch, and iOS mutes it on silent.
- While the Hold is on, the Hold Zone itself glows, not the zone's edge.
- The Gesture Lab is a test bench: a tab each for usePan, useGesture, and useSwipe with useTap, each with a lane with no Hold and a lane under the Hold.
