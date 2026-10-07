---
'@kstackz/use-gesture': patch
'@kstackz/expo-platform': patch
---

use-gesture's core gains `thumbLock(options)`: the Thumb Lock as a Gesture listener on any platform, a still left thumb beside a moving finger, telling the Lock, each move of that finger, and whether it ended lifted or called off.

expo-platform fills its `./input` and Thumb Picker. `./input` has `GestureSurface`, which tracks every finger by id through one Gesture Handler manual gesture and feeds use-gesture's core, and `useGesture(listener)`, which hears it and can claim the touch from the views under the fingers. `./patterns/thumb-picker` has `ThumbPicker`, the Thumb Lock's picker over a tree of choices (Steps, opening and going back, the Wrong Way shake) on Reanimated, dimmed and blurred with expo-blur, a new optional peer. `./patterns/sidebar` gains `SidebarEdge`, a swipe right from the left edge that opens the Sidebar. The Drawer no longer comes back part way open after a drag closed it.
