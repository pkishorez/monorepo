---
'@kestack/web-platform': patch
---

`ImageViewer` stops at the first and last image, opens without sliding, and moves between images faster.

**Fixed**

- Past the first or the last image, a swipe gives a little and springs back, and the arrow and key that way do nothing: it never wraps around to the other end.
- An image opened afresh shows in place. It used to slide in from the side the last move went.
- Moving to the next image takes 0.32 s instead of about 0.8 s: the image shown carries on off the screen in 120 ms, and the next eases in from a third of the way across in 200 ms.
