---
'@kstackz/expo-toolkit': patch
---

The Sidebar opens from a swipe anywhere, as on the web, over nested Gesture Zones:

- **`./input`**: `GestureZone` (new) nests a Gesture Zone inside a `GestureSurface`, so use-gesture's core gives a swipe to the innermost zone that wants it before the zones around it. `NativeScroll` (new) is a ScrollView in a zone of its own that keeps the one-finger swipes it can still scroll, as the web's Native Scroll, scrolls beside the surface's gesture, and does not bounce unless told. A surface now waits one task before feeding a landing to the core, so the zones under the finger have told where it landed.
- **Sidebar**: `SidebarSwipe` replaces `SidebarEdge`: a one-finger swipe right from anywhere opens the Sidebar under the finger, unless a zone inside wants it; the left edge strip stays the Sidebar's. `useSidebarDrag` is gone. Breaking for callers of either.
- **Pages** are a Gesture Zone and take only a swipe that turns a page: on the first page a swipe right, and on the last a swipe left, go to the zones around them. `beforeFirst` is gone. Breaking for its callers.
- **Choice** scrolls through `NativeScroll`: a swipe right at its start reaches what is around it, such as a Sidebar.
