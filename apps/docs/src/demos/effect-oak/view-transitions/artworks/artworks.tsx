import type { CSSProperties } from 'react';
import { Input } from '@kstackz/web-platform/components/input';
import { Link } from '../../location/index.js';

/*
 * The gradient gallery: the grid with its filter, and one artwork's page.
 *
 * The square on the card and the one on the page share a
 * `view-transition-name`, so the browser morphs one into the other when the
 * route changes inside a View Transition. Each name must be unique on the
 * page, so every artwork carries its own; the shared `artwork` class lets the
 * CSS reach all of them.
 */

type Artwork = {
  readonly id: number;
  readonly title: string;
  readonly medium: string;
  readonly description: string;
  readonly gradient: string;
};

const ARTWORKS: ReadonlyArray<Artwork> = [
  {
    id: 1,
    title: 'Dawn Chorus',
    medium: 'Gradient on canvas',
    description:
      'A warm wash of first light. The rose bleeds into amber the way a sunrise refuses a hard edge.',
    gradient: 'from-rose-400 to-amber-300',
  },
  {
    id: 2,
    title: 'Deep Water',
    medium: 'Gradient on linen',
    description:
      'Open ocean past the shelf, where the blue stops describing depth and starts describing weight.',
    gradient: 'from-sky-500 to-indigo-700',
  },
  {
    id: 3,
    title: 'Moss Study',
    medium: 'Gradient on paper',
    description:
      'Forest floor after a week of rain. Every green in the study is borrowed from something alive.',
    gradient: 'from-lime-400 to-emerald-600',
  },
  {
    id: 4,
    title: 'Violet Hour',
    medium: 'Gradient on canvas',
    description:
      'The ten minutes after sunset when streetlights and sky briefly agree on a color.',
    gradient: 'from-purple-500 to-fuchsia-400',
  },
  {
    id: 5,
    title: 'Kiln',
    medium: 'Gradient on steel',
    description:
      'Heat rendered literally. Orange at the mouth of the furnace, red where the eye gives up.',
    gradient: 'from-orange-500 to-red-600',
  },
  {
    id: 6,
    title: 'Glacier Milk',
    medium: 'Gradient on linen',
    description:
      'Meltwater carries rock flour that turns whole rivers this improbable, chalky turquoise.',
    gradient: 'from-cyan-300 to-teal-500',
  },
  {
    id: 7,
    title: 'Graphite',
    medium: 'Gradient on paper',
    description:
      'A monochrome argument that gray is not one color. Pencil shading scaled up to a weather system.',
    gradient: 'from-slate-400 to-zinc-700',
  },
  {
    id: 8,
    title: 'Pollen',
    medium: 'Gradient on canvas',
    description:
      'Late spring in a single field. The yellow is loud on purpose; so is the season.',
    gradient: 'from-yellow-300 to-lime-500',
  },
];

export const artworkPath = (id: number) => `/artwork/${id}`;
export const GALLERY_PATH = '/';

const morph = (id: number): CSSProperties => ({
  viewTransitionName: `artwork-${id}`,
  viewTransitionClass: 'artwork',
});

type Navigate = (path: string) => void;

const matching = (filter: string) => {
  const query = filter.trim().toLowerCase();
  return query === ''
    ? ARTWORKS
    : ARTWORKS.filter((artwork) =>
        `${artwork.title} ${artwork.medium}`.toLowerCase().includes(query),
      );
};

export const GalleryPage = ({
  filter,
  onFilter,
  onNavigate,
}: {
  readonly filter: string;
  readonly onFilter: (filter: string) => void;
  readonly onNavigate: Navigate;
}) => {
  const shown = matching(filter);
  return (
    <div className="flex flex-col gap-8">
      <Input
        type="search"
        aria-label="Filter artworks"
        placeholder="Filter by title or medium…"
        className="max-w-md"
        value={filter}
        onChange={(event) => onFilter(event.target.value)}
      />
      {shown.length === 0 ? (
        <p className="text-muted-foreground">No artworks match the filter.</p>
      ) : (
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
          {shown.map((artwork) => (
            <Link
              key={artwork.id}
              to={artworkPath(artwork.id)}
              onNavigate={onNavigate}
              className="group block"
            >
              <div
                className={`aspect-square rounded-xl bg-linear-to-br shadow-sm transition-shadow group-hover:shadow-lg ${artwork.gradient}`}
                style={morph(artwork.id)}
              />
              <p className="mt-3 font-medium">{artwork.title}</p>
              <p className="text-sm text-muted-foreground">{artwork.medium}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

const Back = ({ onNavigate }: { readonly onNavigate: Navigate }) => (
  <Link
    to={GALLERY_PATH}
    onNavigate={onNavigate}
    className="text-muted-foreground underline hover:text-foreground"
  >
    ← Back to gallery
  </Link>
);

/*
 * The hero keeps the card's square on purpose: a square growing into a wider
 * box visibly stretches mid-flight, while a square into a square is a clean
 * scale and move.
 */
export const ArtworkPage = ({
  artworkId,
  onNavigate,
}: {
  readonly artworkId: number;
  readonly onNavigate: Navigate;
}) => {
  const artwork = ARTWORKS.find((each) => each.id === artworkId);
  if (!artwork)
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-3xl font-semibold">Artwork not found</h1>
        <p className="text-muted-foreground">
          No artwork exists with ID {artworkId}.
        </p>
        <Back onNavigate={onNavigate} />
      </div>
    );
  return (
    <div className="flex flex-col gap-6">
      <Back onNavigate={onNavigate} />
      <div className="grid gap-10 md:grid-cols-[minmax(0,24rem)_1fr] md:items-center">
        <div
          className={`aspect-square w-full rounded-2xl bg-linear-to-br shadow-md ${artwork.gradient}`}
          style={morph(artwork.id)}
        />
        <div>
          <h1 className="text-3xl font-semibold">{artwork.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{artwork.medium}</p>
          <p className="mt-4 text-lg leading-relaxed">{artwork.description}</p>
        </div>
      </div>
    </div>
  );
};
