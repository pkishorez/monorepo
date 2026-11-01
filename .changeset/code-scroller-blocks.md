---
'code': patch
---

A long session opens and comes back quicker, and the view stays where you are reading.

- Each part of a turn is its own block: your message, each thing the agent said, each line of its work, and the turn's end. Only the blocks near the view are drawn when the session opens; the rest are drawn afterwards, a screenful at a time, while you aren't scrolling. A long turn opens as quickly as a short one.
- Your place is kept as the block at the top of the screen, and the view is put back there whenever anything above it grows or shrinks. This works the same in every browser.
- Back, Forward and a reload return to that block, through the anchor Kabuki now keeps for each history entry. Anywhere else, a session opens at the bottom.
- What a fork carries on from is drawn whole when opened, beside the fork's own blocks.
- `g g` draws the first blocks and goes straight to the top, instead of drawing the whole session first.
- In a 150-turn session on a CPU slowed 4x: opening is busy for 742 ms instead of 1,489 ms, and coming back for 171 ms instead of 727 ms. Scrolling and sliding the sidebar still run at 60 fps, with nothing moving on screen.
- `pnpm bench` also reports how long until every block is drawn, and how many frames show a block still standing in while scrolling.
