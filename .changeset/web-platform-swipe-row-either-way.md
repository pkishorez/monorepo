---
'@kestack/web-platform': patch
---

`SwipeRow` swipes either way: `direction` left or right, `label` for what shows behind it and a `quiet` `tone` for what is easily undone. It commits past 40% of its width or on a flick, slides out with a spring, closes the gap it leaves and then calls `onSwipe` (was `onDelete`); `enabled` turns it off. On a phone the App Shell's header title is 16px.
