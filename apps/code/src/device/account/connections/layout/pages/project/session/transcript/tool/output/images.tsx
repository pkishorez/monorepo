import { useMemo, useState } from 'react';
import { ImageViewer } from '@kestack/web-platform/recipes/image-viewer';

/*
 * Images a tool gave back, such as a screenshot or an image read: a row of
 * framed previews, each on a quiet tile with a hairline, so it reads as an
 * image at a glance, the last counting any not shown. A tap opens it whole
 * in the Web Platform's image viewer, to zoom into and to move through
 * every image of the same run, one to the next.
 */

export type Image = { readonly mediaType: string; readonly data: string };

const src = ({ mediaType, data }: Image) => `data:${mediaType};base64,${data}`;

/** How tall a preview is: under a run's line, or in a tool's own output. */
const BOX = {
  sm: 'h-24 max-w-44 sm:h-32 sm:max-w-60',
  md: 'h-40 max-w-full sm:h-56',
} as const;

/** Previews, at most `max`, the rest counted on the last; each opens the viewer. */
export function Thumbnails({
  images,
  max = images.length,
  size = 'md',
  onOpen,
}: {
  readonly images: ReadonlyArray<Image>;
  readonly max?: number;
  readonly size?: keyof typeof BOX;
  readonly onOpen: (at: number) => void;
}) {
  const shown = images.slice(0, max);
  const more = images.length - shown.length;
  return (
    <ul aria-label="Images" className="flex flex-wrap gap-2">
      {shown.map((image, at) => (
        <li key={at}>
          <button
            type="button"
            aria-label={`Open image ${at + 1}`}
            onClick={() => onOpen(at)}
            className="focus-ring group relative block cursor-zoom-in rounded-lg border border-border bg-muted/50 p-1 transition-colors duration-150 hover:border-foreground/20 hover:bg-muted motion-reduce:transition-none"
          >
            <img
              src={src(image)}
              alt=""
              className={`${BOX[size]} w-auto rounded-md object-contain`}
            />
            {more > 0 && at === shown.length - 1 && (
              <span className="absolute inset-1 flex items-center justify-center rounded-md bg-black/55 text-sm font-medium text-white tabular-nums">
                +{more}
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Previews that open the viewer on the one tapped, to move through them all. */
export function Images({
  images,
  max,
  size,
}: {
  readonly images: ReadonlyArray<Image>;
  readonly max?: number;
  readonly size?: keyof typeof BOX;
}) {
  const all = useMemo(() => images.map(src), [images]);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      <Thumbnails
        images={images}
        max={max}
        size={size}
        onOpen={(at) => setOpen(all[at] ?? null)}
      />
      <ImageViewer
        src={open}
        images={all}
        onShow={setOpen}
        onClose={() => setOpen(null)}
      />
    </>
  );
}
