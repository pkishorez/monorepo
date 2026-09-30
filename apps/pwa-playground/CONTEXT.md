# PWA Playground

A field guide to PWAs that runs live, one playground per capability.

## Language

**Page Turn**:
Moving from one page to the page it declares before or after it, shown as the current page leaving to one side while the other comes in from the opposite one, whether a finger, a key, a link or Back and Forward asked for it. Which way it turns comes from where the pages sit, never from which way history moved. Under a finger the page coming in need not be loaded yet: a Placeholder Page stands in for it until it is, and until then the turn can still be taken back.
_Avoid_: page transition, paging, route animation

**Turn Surface**:
The part of the screen a Page Turn moves: the page inside it and the Placeholder Page beside it. Everything outside it, such as the header and the menu, holds still.
_Avoid_: page frame, viewport, stage

**Placeholder Page**:
The stand-in for the page a finger's Page Turn goes to: that page's own loading screen, shown until the page has loaded and then turning into it. It says so when the page could not load.
_Avoid_: skeleton, loading screen, card

**Will Turn**:
Whether letting go now finishes the move a finger is making: past a distance or fast enough, the Page Turn completes; otherwise the pages settle back.
_Avoid_: armed, locked, committed
