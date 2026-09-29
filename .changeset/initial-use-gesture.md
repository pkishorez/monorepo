---
'@kstackz/use-gesture': patch
'@kstackz/ui-toolkit': patch
---

Initial release: the gestures block moves out of `@kstackz/ui-toolkit` into its own package.

`GestureProvider`, `GestureZone` and `useGesture` now come from `@kstackz/use-gesture`; `@kstackz/ui-toolkit/components/blocks/gestures` is gone. The zone no longer needs Tailwind: it sets its touch defaults (overscroll contained, no text selection, no iOS callout) as inline style that `style` overrides, and no longer sets `position: relative`; add it where the zone holds absolutely placed children.
