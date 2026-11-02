---
'@kestack/web-platform': patch
---

`ImageViewer` moves through a set of images, and frames each one.

**New**

- `images` and `onShow`: given every image, `src` among them, it says which one it shows, "2 of 5", and moves to the one before or after: by a swipe sideways on touch, the image following the finger and the next sliding in; by arrows at its sides or the arrow keys otherwise. Alone, a sideways swipe only gives a little.
- Its buttons and count show while it is used, and fade after 2.5 s left alone.
- The image sits inside a margin with rounded corners, a hairline and a shadow, on a dimmed, blurred backdrop, so its edges are plain.
