---
'code': patch
---

A long session opens and comes back quicker, and the view stays where you are reading.

- Each part of a turn is its own block: your message, each line of the agent's work, the turn's end, and each paragraph-sized block of what the agent wrote, so a long answer is drawn a part at a time too. A session opens on its last 10 blocks, then adds 10 at a time, before it is first shown, until a screen and a half is drawn above the view. As you scroll up, 10 more are drawn whenever less than that is left. Nothing drawn is taken away.
- Your place is kept as the block at the top of the screen. The view is put back there in the same step that draws more above it, so nothing on screen moves. This works the same in every browser.
- Back, Forward and a reload return to that block and draw from it down, through the anchor Kabuki now keeps for each history entry. Anywhere else, a session opens at the bottom.
- `g g` draws every block, then goes to the top.
- What a fork carries on from is drawn in full when opened.
- A turn laid out once can be skipped by the browser while far from the view, so the sidebar sliding beside a long session stays smooth.
- In a 150-turn session on a CPU slowed 4x: the page holds 346 DOM nodes instead of 24,171, opening is busy for 634 ms instead of 1,489 ms, and coming back for 68 ms instead of 727 ms. Scrolling to the top runs at 60 fps without stopping for more. A session whose last answer is forty answers long shows in 202 ms instead of 455 ms.
- `pnpm bench` also reports how often scrolling up waits at the top for more to be drawn, and times a session whose last answer is very long.
