# View transitions

Status: partial. Clicking an artwork grows it into its page, and back to the
grid, with the browser's own View Transitions and no library. Back and
forward change the page without animating.

## What was ported

Foldkit's `view-transitions`: a gradient gallery with a filter, and a page
per artwork. The card's square and the page's hero share a
`view-transition-name`, so the browser morphs one into the other. The header
is named so it holds still; the old page leaves fast and the new one arrives
late; going to a page is slower than coming back, told apart by the
transition's type (`to-artwork-detail`, `to-gallery`). Typing in the filter
never animates.

```
ViewTransitions (root)     requires Location
  Model { path, filter }   the filter survives opening and closing artworks
  Opening, Gallery, Artwork { artworkId }, NotFound { path }
  every State: Lifetime heardUrl(model.path) → ChangedUrl
  ClickedLink → next State now, Command: Location.push(path)
artworks/    the artworks, the grid with its filter, the artwork page
animate.ts   document.startViewTransition around a Send, with flushSync
view.tsx     the CSS for the transition, and which type each click gets
```

## How it works with Effect Oak

The browser snapshots the page, calls `update`, then animates to whatever
the DOM is when `update` returns. So the DOM must change synchronously
inside it. The View does:

```ts
document.startViewTransition({
  update: () => flushSync(() => send({ _tag: 'ClickedLink', path })),
  types,
});
```

`send` handles the Message at once (the Runtime's queue drains
synchronously), the Instance tells its View, and `flushSync` makes React
commit before returning. That works, with one change from the routing demo:
**the State changes first and the URL follows** in a Command. Waiting for the
URL to come back through a Lifetime, as routing does, would change the DOM
after `update` had already returned.

Time Travel: scrubbing redraws the Views directly, outside any View
Transition, so the past never animates. That is what you want while
scrubbing, but it also means Replay cannot show the animation of a Message.
The `view-transition-name`s stay on the replayed DOM, harmlessly.

## Deviations

- **Back and forward do not animate.** They arrive as `ChangedUrl` from a
  Lifetime, and no View is there to wrap them. Foldkit animates every
  `ChangedUrl`, because its Runtime asks `viewTransition` on every Message.
- **The View decides the type before sending**, from the current State and
  the path it is about to send. Foldkit's `viewTransition` decides after
  Update, from the previous and next Model and the Message.
- The CSS is a `<style>` in the View rather than the app's stylesheet.
- Hash paths and `Link`, as in [routing](../routing/notes.md).

## Blockers

- **No View Transition hook** (new, roll-up 18). Only Messages Sent from a
  View, wrapped by hand, can animate; Messages from Lifetimes and Commands
  (back and forward, a fetch finishing) cannot. A
  `viewTransition: ({ before, after, message }) => false | { types }` option
  on `toReact`, called by the Runtime for each handled Message and wrapping
  the React commit of that Message in `startViewTransition`, skipped during
  Time Travel and with reduced motion, would be the API. The decision is a
  pure function of data, so it is testable like Foldkit's.
- **No routing** (blocker 15).

## Testing

Foldkit's scene tests draw the gallery, the filtered gallery, the empty
state, an artwork and the not-found pages from a Model. Its `viewTransition`
is a plain function, and four tests check it: gallery to artwork is
`to-artwork-detail`, artwork to gallery is `to-gallery`, artwork to artwork
is untyped, and a filter keystroke never transitions.

What Effect Oak would need:

- Drawing a View from a given State and Model (blocker 5) for the scenes.
- `typesFor` and `routeFrom` are plain functions and testable today, but
  they are not what the Runtime runs: the View calls them. With the
  `viewTransition` option above, the tested function would be the one used.
