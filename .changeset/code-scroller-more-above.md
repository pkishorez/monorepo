---
'code': patch
---

Scrolling up to the top of what a long session has drawn so far shows "Loading earlier messages", and the earlier messages come in a moment after the scrolling stops.

- While earlier messages are still to be drawn, a line with a spinner at the top of the transcript says they are on their way, so reaching it no longer looks like an empty page.
- Within a screen of that top, a phone no longer bounces, so a flick that reaches it stops there. The earlier messages are then drawn about 0.2 s later, instead of after a bounce of most of a second. Everywhere else, and once everything is drawn, scrolling bounces as before.
