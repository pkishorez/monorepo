import { View } from 'effect-oak/react';
import type { ViewProps } from 'effect-oak/react';
import { Link } from '../location/index.js';
import { animate } from './animate.js';
import { ArtworkPage, GALLERY_PATH, GalleryPage } from './artworks/index.js';
import { ViewTransitions, routeFrom } from './view-transitions.js';

/*
 * The header is named so the browser lifts it out of the page's snapshot
 * and holds it still. The old page leaves quickly, then the new one arrives,
 * while the artwork grows; arriving is unhurried, returning is brisk, told
 * apart by the transition's type. Everything else on the docs page (the
 * Shell) is the same before and after, so its cross-fade cannot be seen.
 */
const STYLE = `
::view-transition-group(page-header) { animation: none; }
::view-transition-old(root) { animation-duration: 130ms; animation-timing-function: ease-in; }
::view-transition-new(root) {
  animation-delay: 100ms; animation-duration: 240ms;
  animation-timing-function: ease-out; animation-fill-mode: backwards;
}
::view-transition-old(.artwork), ::view-transition-new(.artwork) { animation-duration: 160ms; }
:root:active-view-transition-type(to-artwork-detail)::view-transition-group(.artwork) {
  animation-duration: 480ms; animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
}
:root:active-view-transition-type(to-gallery)::view-transition-group(.artwork) {
  animation-duration: 320ms; animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
}
`;

/** Which way a navigation goes, for the CSS: Foldkit's `viewTransition` config. */
const typesFor = (from: string, path: string) => {
  const to = routeFrom(path)._tag;
  if (from === 'Gallery' && to === 'Artwork') return ['to-artwork-detail'];
  if (from === 'Artwork' && to === 'Gallery') return ['to-gallery'];
  return [];
};

type Go = (path: string) => void;

/** The page for the route the root is on. */
const pageFor = (self: ViewProps<typeof ViewTransitions>, go: Go) => {
  switch (self._tag) {
    case 'Opening':
      return null;
    case 'Gallery':
      return (
        <GalleryPage
          filter={self.model.filter}
          onFilter={(filter) => self.send({ _tag: 'EditedFilter', filter })}
          onNavigate={go}
        />
      );
    case 'Artwork':
      return <ArtworkPage artworkId={self.state.artworkId} onNavigate={go} />;
    case 'NotFound':
      return (
        <div className="flex flex-col gap-4">
          <h1 className="text-3xl font-semibold">Page not found</h1>
          <p className="text-muted-foreground">
            The path “{self.state.path}” does not exist.
          </p>
          <Link
            to={GALLERY_PATH}
            onNavigate={go}
            className="underline hover:text-foreground"
          >
            ← Back to gallery
          </Link>
        </div>
      );
  }
};

export const ViewTransitionsView = View.make(ViewTransitions, (self) => {
  if (self._tag === 'Opening') return null;
  const go = (path: string) =>
    animate(typesFor(self._tag, path), () =>
      self.send({ _tag: 'ClickedLink', path }),
    );
  return (
    // Keyed by route, so each page starts scrolled to the top.
    <div key={self._tag} className="size-full overflow-y-auto py-10">
      <style>{STYLE}</style>
      <header
        className="mx-auto max-w-5xl px-6 pb-8"
        style={{ viewTransitionName: 'page-header' }}
      >
        <Link
          to={GALLERY_PATH}
          onNavigate={go}
          className="text-2xl font-semibold"
        >
          Gradient Gallery
        </Link>
        <p className="mt-1 text-muted-foreground">
          Click an artwork and watch it grow into its page. Typing in the filter
          never animates.
        </p>
      </header>
      <main className="mx-auto max-w-5xl px-6">{pageFor(self, go)}</main>
    </div>
  );
});
