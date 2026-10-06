# A swipe from the Sidebar's edge always moves it

Status: accepted. Extends ADR-0014.

A Sidebar that opens from anywhere wanted only its Direction, so a zone
inside it that wanted the same Direction took a swipe from the edge too:
swipeable tabs inside the screen turned a tab instead of opening the
Sidebar. Now a one-finger touch that lands in the Sidebar's edge strip, 24px
or its `edge`, is captured by the Sidebar's zone, which beats every
Direction inside it. Past the strip, the zone inside still takes its own
swipes.

## Considered options

- **Let the zone inside skip touches that land at the edge.** Rejected: each
  zone would have to know where the Sidebar is, and a Swipe has no way to
  refuse a touch by where it lands.
- **Capture every touch in the strip, whatever the finger count.** Rejected:
  a Thumb Lock's thumb resting at the edge would hand its Gesture to the
  Sidebar.

## Consequences

- A one-finger touch in the strip never scrolls. It already could not on
  iOS or Android, as the edge guard cancels its start.
- A one-finger swipe left from the strip, while the Sidebar is closed, does
  nothing, where a zone inside could have taken it before.
