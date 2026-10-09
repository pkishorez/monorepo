import { Effect, Schema, Stream } from 'effect';
import { Node } from 'effect-oak';
import { View } from 'effect-oak/react';
import { Link, Location, pushUrl } from '../../location/index.js';
import { PAINTINGS, paintingPath } from './paintings.js';

/*
 * The Gallery page and the Painting page.
 *
 * The catalog is a Child of the root's Gallery State: entering the Gallery
 * creates it, and its Loading Lifetime fetches (600 ms of pretend) once per
 * entry. Leaving the Gallery mid-load destroys it and the load with it, so
 * coming back starts a fresh one and never a second at once. This is
 * Foldkit's `Transition.isEntering(transition, 'Gallery')` with nothing
 * written: an entry is a Child being created.
 *
 * A painting is drawn from the root's Painting State, which loads it itself:
 * moving from one painting to the next stays in that State, so no Lifetime
 * or Child would start again.
 */

const CATALOG_MS = 600;

export const Catalog = Node.make('Catalog', {
  requires: { location: Location },
  state: Schema.TaggedUnion({ Loading: {}, Ready: {} }),
  message: Schema.TaggedUnion({
    LoadedCatalog: {},
    ClickedLink: { path: Schema.String },
  }),
}).build({
  init: () => ({ state: { _tag: 'Loading' } }),
  lifetime: {
    Loading: () =>
      Stream.fromEffect(
        Effect.sleep(CATALOG_MS).pipe(
          Effect.as({ _tag: 'LoadedCatalog' as const }),
        ),
      ),
  },
  update: {
    Loading: { LoadedCatalog: () => ({ state: { _tag: 'Ready' } }) },
    Ready: {
      ClickedLink: ({ path }) => ({ commands: [pushUrl(path)] }),
    },
  },
});

const Waiting = ({ label }: { readonly label: string }) => (
  <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
    {label}
  </div>
);

const Intro = () => (
  <>
    <h1 className="text-3xl font-semibold">Gallery</h1>
    <p className="text-muted-foreground">
      The catalog loads each time this page is entered, by a link or a reload.
    </p>
  </>
);

export const CatalogView = View.make(Catalog, {
  Loading: () => (
    <section className="flex flex-col gap-4">
      <Intro />
      <Waiting label="Hanging the paintings…" />
    </section>
  ),
  Ready: ({ send }) => (
    <section className="flex flex-col gap-4">
      <Intro />
      <ul className="grid gap-4 sm:grid-cols-2">
        {PAINTINGS.map((painting) => (
          <li key={painting.id}>
            <Link
              to={paintingPath(painting.id)}
              onNavigate={(path) => send({ _tag: 'ClickedLink', path })}
              className="block overflow-hidden rounded-lg border hover:shadow-md"
            >
              <div className={`h-28 bg-linear-to-br ${painting.gradient}`} />
              <div className="p-4">
                <h3 className="font-semibold">{painting.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {painting.artist}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  ),
});

/** Whether the root should load a painting for this id. */
export const hangs = (id: number) => PAINTINGS.some((p) => p.id === id);

export const PaintingPage = ({
  paintingId,
  ready,
  onNavigate,
}: {
  readonly paintingId: number;
  readonly ready: boolean;
  readonly onNavigate: (path: string) => void;
}) => {
  const index = PAINTINGS.findIndex((p) => p.id === paintingId);
  const painting = PAINTINGS[index];
  const back = (
    <Link
      to="/gallery"
      onNavigate={onNavigate}
      className="text-primary hover:underline"
    >
      ← Back to Gallery
    </Link>
  );
  if (!painting)
    return (
      <section className="flex flex-col gap-4">
        <h1 className="text-3xl font-semibold text-destructive">
          Painting Not Found
        </h1>
        <p className="text-muted-foreground">
          No painting with id {paintingId} hangs in this gallery.
        </p>
        {back}
      </section>
    );
  const neighbor = (label: string, at: number) => {
    const other = PAINTINGS[at];
    return other ? (
      <Link
        to={paintingPath(other.id)}
        onNavigate={onNavigate}
        className="font-medium text-primary hover:underline"
      >
        {label}
      </Link>
    ) : (
      <span className="text-muted-foreground/50">{label}</span>
    );
  };
  return (
    <section className="flex flex-col gap-4">
      {back}
      {ready ? (
        <article className="overflow-hidden rounded-lg border">
          <div className={`h-56 bg-linear-to-br ${painting.gradient}`} />
          <div className="p-6">
            <h1 className="text-3xl font-semibold">{painting.title}</h1>
            <p className="text-muted-foreground">{painting.artist}</p>
          </div>
        </article>
      ) : (
        <Waiting label="Unpacking the painting…" />
      )}
      <div className="flex items-center justify-between">
        {neighbor('← Previous', index - 1)}
        <span className="text-sm text-muted-foreground">
          {index + 1} of {PAINTINGS.length}
        </span>
        {neighbor('Next →', index + 1)}
      </div>
    </section>
  );
};
