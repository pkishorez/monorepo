# Zones capture only the Directions a listener wants

A zone captured every touch at its first movement unless an element under the finger could still scroll that way. So a zone that only swiped rows sideways still stopped the page from scrolling up and down: a demo card with nothing that scrolls inside it held the page still, and an open mail row, its own zone over the row, held the list still. Only scrolling elements inside the innermost zone were asked, never the page or a list around the zone, and a list scrolled to its end handed the touch to the zone even when nothing there wanted it.

Now a listener says which Directions it wants, `directions: ['left', 'right']` or `'all'`, and a zone captures a touch only when one it hears wants the Direction the touch first moves in. Everything else is the browser's, which scrolls whatever can scroll, and the Gesture ends Interrupted. The Direction is read once, at the first `touchmove` — the one moment the browser waits for a page before it scrolls — as up, down, left or right, whichever the finger moved most, and every listener is given it, so a Swipe follows the Direction the engine took rather than locking its own. A listener that lists none only watches. `useSwipe` lists its own direction while enabled, unless it starts only from an edge, where it captures the edge instead; so the Patterns built on it need nothing new. A Swipe whose direction is not the touch's Direction Cancels for the wrong direction at once, whoever takes the touch.

At the first movement, first match wins: an element marked `data-zone-gesture="disabled"`, or text entry, is the browser's; one marked `enabled` is the zone's; a listener whose `captures(point)` is true takes it, over any scroller, as a Swipe from an edge does; an element that can still scroll that way keeps it; a listener that wants the Direction takes it; and anything left is the browser's. Two fingers down before the first movement are always the zone's, so a pinch needs no setup.

Who acts on a Gesture changes too. Every zone from the innermost up to the first Trapped one still hears it from the first finger, but at the first movement one of them takes it, chosen from the first finger in two passes: the innermost zone whose listener captures where that finger landed, and only when none does, the innermost with a listener that wants its Direction. A claim on a spot is narrow and deliberate, so it beats a broad claim on a Direction from a zone inside it; otherwise a list that swipes its rows sideways would swallow every edge swipe over it. Listeners that act in every other zone, around the one that took it or inside it, drop the Gesture; listeners that only watch keep hearing it, so an overlay that draws the fingers keeps working. With two fingers down before the first movement the touch is always captured, and the zone is chosen the same way. An open row that wants only `right` lets a swipe left reach a sidebar around it with nothing turned off by hand. Trapped now only hides a zone's Gestures from the zones around it; it never keeps a touch from the browser.

Partly supersedes ADR 0005 (a zone captures what scrollers do not keep), ADR 0009 (every zone up to the first trapped one keeps the Gesture), and ADR 0010 (the app keeps two Recognizers on the same Gesture apart with zones, `trapped` and `enabled`).

## Considered Options

- **Keep capturing everything and fix each demo with `trapped` or `data-zone-gesture="disabled"`**: rejected. Nothing inside a zone can say "let the page scroll", since the page is never asked.
- **A plain `useGesture` wants every Direction unless it says otherwise**: rejected. Any hook that only watches, such as one that notes which row a finger landed on, would keep capturing everything.
- **Folding the Directions into `captures`**: rejected. A row that wants `left` should still give way to a strip that scrolls under it; a Swipe from an edge should not. Those are two strengths, so they are two options.
- **Every zone that hears a Gesture keeps it, and the app keeps them apart**: rejected. Every nested screen had to turn its outer zones off by hand for each state.
- **Deciding when the finger lands**: impossible. No Direction exists yet, and the browser gives a page one chance to stop a scroll: the first `touchmove`.

## Consequences

- The decision is final for the touch: the browser stops asking once it scrolls, so a touch that scrolled cannot become a Swipe until every finger lifts.
- A slightly diagonal drag goes wholly one way or the other; nothing follows both axes.
- Each touch in a zone still waits for one main-thread answer before the browser may scroll, as before; touches outside zones never wait.
- A zone guards a screen edge from the browser's back swipe only when a listener it hears could take a touch there: `captures(point)` is true, or it wants the Direction away from that edge.
- Zones no longer set `overscroll-behavior: contain`, so a list at its end hands the scroll on; a full-screen app sets it itself.
- Every plain `useGesture` that holds, drags, pans or pinches with one finger must list its Directions or use `captures`.
