# Scroll restoration follows TanStack Router

Kabuki restores scroll as TanStack Router does, with its option names: `scrollRestoration`, `getScrollRestorationKey`, `scrollToTopSelectors`, `scrollRestorationBehavior` and `defaultHashScrollIntoView` on `Router.app`, `resetScroll`, `hash` and `hashScrollIntoView` on a move, `data-scroll-restoration-id` on an element, and `useElementScrollRestoration`. The window and every element the user scrolls are kept per history entry, what stays on the page keeps where it was, and a new entry starts at the top. Under Start, the page holds an inline script that puts it back before the app hydrates. It lives in `src/routing/scroll`, which imports nothing else of routing.

Kabuki adds two things TanStack has no need of: a move lands before its data after 150 ms, so restoring waits for every Place's data, and scrolls meanwhile, as the browser clamping the window when a page goes out, are not kept; and nothing scrolls while the app shows a past Step.

## Considered Options

- **Each Place restoring its own Scroll areas, marked with `useScroll`, with a mode per page (`entry`, `url`, `false`) and the window the deepest Place's**: built first, and rejected. It needed a rule for who owns the window and when it resets, each fixing the last case and breaking the next: a page drawn inside a scrolling `<main>` was never reset or restored, as its Place is never made again.
- **Rules of Kabuki's own, as revealing what changed rather than going to the top**: rejected. TanStack's are what a site of whole pages does, they are known, and an app moving between the two reads the same options.
- **Elements marked by hand rather than tracked**: rejected. TanStack tracks every element scrolled, named by its path unless it says `data-scroll-restoration-id`; a page that animates one pane out as another comes in names them, as the docs say.

## Consequences

- Entry keys never repeat across page loads: a saved position is read for the entry it was saved for.
- A replace keeps its Entry's key, so it keeps its scroll, where TanStack's new location resets it: a search that replaces on each keystroke keeps its results where they were.
- Start reads the script from the Router, `restoreScroll(route)`, and knows nothing of scroll.
