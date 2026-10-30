import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@kestack/web-platform/ui/components/dialog';
import { type ReactNode, useState } from 'react';
import { Clamped, type Opening } from '../../words/index.ts';
import type { Row } from '../../turns/rows/index.ts';

/*
 * What every kind of tool shows when opened, drawn the same: text in a
 * quiet block of monospace that scrolls sideways rather than overflow;
 * a label over it; and what a finished call gave back, or why it failed,
 * its start only until asked for all, and the images it gave back, such as
 * a file read, as thumbnails, each opened whole over the page by a tap.
 */

type ToolRow = Extract<Row, { readonly kind: 'tool' }>;

const BLOCK =
  'overflow-x-auto rounded-lg bg-muted/50 px-3 py-2.5 font-mono text-xs leading-5 whitespace-pre-wrap break-words';

/** Monospace text in a quiet block. */
export function Block({
  tone = 'plain',
  children,
}: {
  readonly tone?: 'plain' | 'failed';
  readonly children: ReactNode;
}) {
  return (
    <pre className={`${BLOCK} ${tone === 'failed' ? 'text-destructive' : ''}`}>
      {children}
    </pre>
  );
}

/** A label over what it names. */
export function Labelled({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

/** What a finished call gave back, or why it failed; nothing while it runs. */
export function Output({
  row,
  opening,
  label,
}: {
  readonly row: ToolRow;
  readonly opening: Opening;
  /** Its label when it did not fail: "Output" unless the kind says better. */
  readonly label?: string;
}) {
  if (!row.result) return null;
  const images = row.result.images ?? [];
  return (
    <Labelled label={row.result.isError ? 'Error' : (label ?? 'Output')}>
      {(row.result.output !== '' || images.length === 0) && (
        <Block tone={row.result.isError ? 'failed' : 'plain'}>
          <Clamped
            id={`${row.id}:output`}
            opening={opening}
            text={row.result.output || '(no output)'}
          />
        </Block>
      )}
      {images.length > 0 && <Images images={images} />}
      {row.result.truncated && (
        <span className="text-xs text-muted-foreground">Output cut short</span>
      )}
    </Labelled>
  );
}

type Image = NonNullable<NonNullable<ToolRow['result']>['images']>[number];

/** Images a tool gave back: thumbnails, each opened whole by a tap. */
function Images({ images }: { readonly images: ReadonlyArray<Image> }) {
  const [open, setOpen] = useState<number | null>(null);
  const shown = open === null ? null : images[open];
  const src = ({ mediaType, data }: Image) =>
    `data:${mediaType};base64,${data}`;
  return (
    <>
      <ul aria-label="Images" className="flex flex-wrap gap-2">
        {images.map((image, at) => (
          <li key={at}>
            <button
              type="button"
              aria-label={`Open image ${at + 1}`}
              onClick={() => setOpen(at)}
              className="focus-ring block cursor-zoom-in rounded-md"
            >
              <img
                src={src(image)}
                alt=""
                className="max-h-48 max-w-full rounded-md object-contain outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
              />
            </button>
          </li>
        ))}
      </ul>
      <Dialog
        open={shown !== null && shown !== undefined}
        onOpenChange={(next) => !next && setOpen(null)}
      >
        <DialogContent className="w-auto max-w-[calc(100vw-1rem)] p-2 sm:max-w-[calc(100vw-4rem)]">
          <DialogTitle className="sr-only">Image</DialogTitle>
          {shown && (
            <img
              src={src(shown)}
              alt=""
              className="max-h-[calc(100dvh-4rem)] max-w-full rounded-lg object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** A call's input as JSON. */
export const json = (input: unknown) =>
  typeof input === 'string' ? input : JSON.stringify(input, null, 2);
