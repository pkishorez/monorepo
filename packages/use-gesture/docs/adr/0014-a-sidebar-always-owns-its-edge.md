# A Sidebar always owns its edge

Status: accepted. Narrows ADR-0012's edge guard for the Sidebar Pattern.

ADR 0012 guards a screen edge from the browser's edge swipe only while a
listener could take a touch there. An open left Sidebar disables its opening
Swipe and its closing Swipe wants only `left`, so nothing claimed the left edge
and a swipe from it went back a page. Now the Sidebar Pattern claims its own
side's edge whenever it is enabled, open or closed, even though a swipe there
while open does nothing: doing nothing is better than leaving the app. It is
not an option; turning the Sidebar off gives the edge back. The other edge
stays under ADR 0012.

## Consequences

- A tap within the edge strip of a Sidebar's side does not click on a plain
  element, open or closed.
- Links and buttons in that strip are still left to the browser, so an edge
  swipe that starts on one can still go back. The app shell's Sidebar keeps its
  padding as it was rather than give up width to close that gap.
