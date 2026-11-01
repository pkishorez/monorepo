---
'code': patch
---

Flicking up through a long session on a phone no longer flashes blank or jumps.

- While your finger, or the glide it set off, moves the view, nothing is drawn above it and the view is not moved. A phone's glide ignores the page moving the view, so drawing above during a flick made the screen leap back and forth: in a 150-turn session on the iOS Simulator, one fast flick showed 43 blank frames out of 86. It now shows none.
- What waited is drawn once the glide stops, without moving what is on screen. Up to four screens are then kept drawn above the view, more than a flick usually goes, drawn a few at a time without holding up the page.
