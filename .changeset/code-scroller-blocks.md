---
'code': patch
---

A long session opens and comes back quicker, and the view stays where you are reading.

- Each part of a turn is its own block: your message, each thing the agent said, each line of its work, and the turn's end. A session opens on its last 30 blocks. As you scroll up, 30 more are drawn each time you come within a screen and a half of the top, so scrolling up rarely reaches the end of what's drawn. Nothing drawn is taken away.
- Your place is kept as the block at the top of the screen. The view is put back there in the same step that draws more above it, so nothing on screen moves. This works the same in every browser.
- Back, Forward and a reload return to that block and draw from it down, through the anchor Kabuki now keeps for each history entry. Anywhere else, a session opens at the bottom.
- `g g` draws every block, then goes to the top.
- What a fork carries on from is drawn in full when opened.
- A turn laid out once can be skipped by the browser while far from the view, so the sidebar sliding beside a long session stays smooth.
- In a 150-turn session on a CPU slowed 4x: the page holds 727 DOM nodes instead of 24,171, opening is busy for 653 ms instead of 1,489 ms, and coming back for 93 ms instead of 727 ms. Scrolling to the top runs at 60 fps without stopping for more.
- `pnpm bench` also reports how often scrolling up waits at the top for more to be drawn.
