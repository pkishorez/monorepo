# Each Place puts its own scroll back

A page says where its Scroll areas go back to, `scroll: 'entry' | 'url' | false`, inherited by the pages under it as `render` is, `entry` at the root. Its View marks each area with `useScroll(name?)`; the window is the deepest Place's. Each Place puts its own areas back as it is drawn with its data: a kept Place is never drawn again, so it is never touched. All of it lives in `src/routing/scroll`, outside the Snapshot: positions are remembered in memory as they scroll and saved to the tab's session storage, read and written in `session.ts` alone, when an entry is left or the page is hidden. None of it runs while the app shows a past Step.

```tsx
export const Folder = Route.page({
  path: '/:folder',
  scroll: 'url',
  pages: { Message },
}).build({});
export const FolderView = Route.view(Folder, (self) => {
  const list = useScroll();
  return <ul ref={list}>…</ul>;
});
```

## Considered Options

- **In each Place's Actor, as it starts**: rejected. An Actor never touches the page, Replay starts every Instance again, so Time Travel and a hot reload would scroll, and an Actor starts before its View is drawn and often before its data. The Place's View is drawn where both are known, keyed by its Instance, so it is the Place's own lifecycle all the same.
- **One handler for the whole page, keyed by URL**: rejected. Nested Places scroll on their own, and a Place a move keeps must not jump.
- **In the Snapshot, a Message per scroll**: rejected. Dozens a second, on the Timeline, for a position that is a fact about the screen, not the app.
- **In `history.state`**: rejected. Each save would be a `replaceState`, which Safari throttles, and a place's own position, kept however the app comes back, has no entry to live on.
- **`Router.app(…, { scroll })` for the app's default**: rejected. The root is a page, so its `scroll` is the default, and every place says its own as it says `render`.

## Consequences

- Entry keys must never repeat across page loads, or a saved position would be read for the wrong entry: each page load's keys start with a session the address Worker makes, and an entry the address already holds a key for keeps it.
- Taking scroll out is `src/routing/scroll` and five lines that reach it: `scroll` on a page's node, `ScrollPlace` in `Route.view`, `Scrolling` in the Router's View, `scroll` on a push or replace, and the `scroll` prop of `Router.Link`.
- Views can now ask whether they draw the app as it is, `useLive()`, so whatever touches the page around the app can stay still under Time Travel.
