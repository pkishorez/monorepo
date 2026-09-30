---
status: partly superseded by ADR-0012 (the guard applies only when a listener could take a touch at the edge)
---

# Zones keep the screen edges from the back swipe

On iOS, in Safari and in an installed app, a swipe from the left edge goes back a page and one from the right goes forward. A zone held the browser back only at a touch's first `touchmove`, but iOS decides on its edge swipe from `touchstart`, so a sidebar swipe that started right at the edge sometimes went back instead, most often in quick back-and-forth swipes. Now a zone cancels the `touchstart` of a touch that lands within 24px of a side edge: the one signal a page has to keep iOS from starting its edge swipe.

Cancelling a `touchstart` also cancels its tap's click. So touches on what must still click — links, buttons, form fields, `[role=button]`, focusable elements — and on anything `data-zone-gesture="disabled"` are left to the browser, and an edge swipe that starts on one of them can still go back.

## Considered Options

- **Hold the browser back at `touchmove` only**, as before: rejected; iOS has already begun its edge swipe by then.
- **Cancel every edge `touchstart` and click taps ourselves**: rejected. The block would decide clicks again, which ADR 0009 took out.
- **An option to turn it on**: rejected. An app puts a zone where it owns touch; going back a page from inside one is never what it wants.
- **Undo the navigation on `popstate`**: rejected. The page has already animated away.

## Consequences

- A tap within 24px of a side edge on a plain element in a zone does not click; give such an element a role, a tabindex, or `data-zone-gesture="disabled"`.
- Android's system back gesture is the OS's, and no page can stop it.
