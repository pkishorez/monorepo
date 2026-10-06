---
'@kstackz/expo-toolkit': patch
---

Gestures and motion that match the web on a phone:

- **Sidebar** pushes the page aside instead of sliding a drawer over it. `SidebarProvider` now draws the page (its children) and the Sidebar under it: as the Sidebar opens the page moves 288 points right, shrinks 8 %, rounds and dims, and the Sidebar slides in and fades up, on a 0.3 s spring with no bounce. `SidebarEdge` drives it under the finger and springs open or shut on release; a tap on the page or a drag left shuts it; Android's back button shuts it. `Sidebar` hands in what it shows from anywhere inside the provider. New `useSidebarDrag()` lets another swipe hand its drag to the Sidebar. The edge swipe claims the touch as the finger lands in the strip, so a list under it no longer starts scrolling first. Breaking for callers that relied on the Sidebar being a `Drawer` over the app.
- **Pages** (`./patterns/pages`, new): pages side by side, turned by a one-finger sideways swipe that follows the finger (60 points or 300 points a second, 0.15 s spring with the finger's speed), with `beforeFirst` for a swipe right on the first page and `edge` to leave an edge strip alone.
- **SwipeRow** is the web's row: Delete shows from 24 points, arms past 112 (deeper tile, label pops to 115 %), slides away in 180 ms; short of the line it springs home instead of staying open on a tile. `onArm` and `onCommit` report the moments for sound and haptics; the `haptics` prop is gone.
- **ThumbPicker** announces the marked choice on iOS (VoiceOver has no live regions).
