import { useState } from 'react';
import { ImageViewer } from '@kestack/web-platform/recipes/image-viewer';

/*
 * Images a tool gave back, such as a screenshot or an image read: a row of
 * thumbnails, the last counting any not shown, each opened whole over the
 * page in the Web Platform's image viewer, to zoom into.
 */

export type Image = { readonly mediaType: string; readonly data: string };

const src = ({ mediaType, data }: Image) => `data:${mediaType};base64,${data}`;

/** Thumbnails, at most `max`, the rest counted on the last; each opens the viewer. */
export function Thumbnails({
  images,
  max = images.length,
  size = 'md',
  onOpen,
}: {
  readonly images: ReadonlyArray<Image>;
  readonly max?: number;
  readonly size?: 'sm' | 'md';
  readonly onOpen: (at: number) => void;
}) {
  const shown = images.slice(0, max);
  const more = images.length - shown.length;
  const box = size === 'sm' ? 'h-14 max-w-24' : 'max-h-48 max-w-full';
  return (
    <ul aria-label="Images" className="flex flex-wrap gap-2">
      {shown.map((image, at) => (
        <li key={at} className="relative">
          <button
            type="button"
            aria-label={`Open image ${at + 1}`}
            onClick={() => onOpen(at)}
            className="focus-ring group block cursor-zoom-in overflow-hidden rounded-md"
          >
            <img
              src={src(image)}
              alt=""
              className={`${box} rounded-md object-cover outline outline-1 -outline-offset-1 outline-black/10 transition-[filter] duration-150 group-hover:brightness-95 motion-reduce:transition-none dark:outline-white/10`}
            />
            {more > 0 && at === shown.length - 1 && (
              <span className="absolute inset-0 flex items-center justify-center rounded-md bg-black/55 text-sm font-medium text-white tabular-nums">
                +{more}
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Thumbnails that open the viewer on the one tapped. */
export function Images({
  images,
  max,
  size,
}: {
  readonly images: ReadonlyArray<Image>;
  readonly max?: number;
  readonly size?: 'sm' | 'md';
}) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <>
      <Thumbnails images={images} max={max} size={size} onOpen={setOpen} />
      <ImageViewer
        src={
          open === null || images[open] === undefined ? null : src(images[open])
        }
        onClose={() => setOpen(null)}
      />
    </>
  );
}
