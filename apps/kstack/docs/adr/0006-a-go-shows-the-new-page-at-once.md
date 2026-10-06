# A Go shows the new page at once

Status: accepted

Every Go used to slide the page up or down by the Place order, as a view
transition (ADR 0005). Now the new page shows at once. While a view
transition runs, the browser shows a picture of the page over it, and every
touch lands on that picture instead of the page: a finger put down mid-slide
was outside every Gesture Zone until it lifted, so a Thumb Lock straight
after a Go never held, and a tap mid-slide reached nothing.

## Considered options

- **Keep the slide and let the gesture engine find the zone under a finger
  that lands on the picture.** Rejected: it works around the picture for
  gestures only, guesses which zone is on top from where it sits, and taps
  on buttons stay dead mid-slide.
- **Let touches pass through the picture with `pointer-events: none`.**
  Rejected: neither Chromium nor WebKit honours it; the touch still lands on
  the root.
- **A slide only where no Thumb Lock gave the Go.** Rejected: the page should
  move the same way however Go was given (ADR 0005), and any touch mid-slide
  is still lost.
