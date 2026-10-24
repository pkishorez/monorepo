---
'@kestack/web-platform': patch
---

A Native Scroll counts every element that can scroll between the finger and the Gesture Zone that would take the touch, not only up to the innermost zone: a list of swiped rows under a pull to refresh scrolls while it is scrolled down, wherever the finger lands. `usePullToRefresh` jumps instead of springing under reduced motion. `SidebarMenuButton`, `SidebarMenuSubButton`, `SidebarInput` and the App Shell header's sidebar toggle keep a finger's size on a wide screen with no keyboard, and are compact only with one; `SidebarInput` keeps 16px text there, so iOS does not zoom.
