import { ArrowRightIcon } from '@kestack/web-platform/components/lucide';
import { ToolkitLink } from '../../components/index.ts';
import { Stop } from '../../field/index.ts';
import type { Chapter as Story } from './chapters.ts';

/*
 * One chapter of the story, a Stop on the field: its number and act, the
 * package's name and pitch, what it does, and whether it is out yet. On a
 * phone the small parts are only named, so their card stays clear of the
 * shape.
 */

function Status({ status }: { readonly status: Story['status'] }) {
  return (
    <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-border px-2.5 font-mono text-[11px] text-muted-foreground">
      {status === 'alpha' ? (
        <>
          <span aria-hidden className="size-1.5 rounded-full bg-foreground" />
          live · alpha
        </>
      ) : (
        'coming soon'
      )}
    </span>
  );
}

export function Chapter({
  chapter,
  index,
}: {
  readonly chapter: Story;
  readonly index: number;
}) {
  const id = `chapter-${chapter.shape}`;
  return (
    <Stop
      shape={chapter.shape}
      side={chapter.side}
      data-chapter
      aria-labelledby={id}
    >
      <p className="flex items-center gap-3 font-mono text-xs text-muted-foreground">
        <span className="tabular-nums">{`${index + 1}`.padStart(2, '0')}</span>
        <span aria-hidden className="h-px w-8 bg-border" />
        {chapter.act}
      </p>
      <h2
        id={id}
        className="mt-4 text-4xl font-semibold tracking-tight text-balance sm:mt-5 sm:text-5xl"
      >
        {chapter.name}
      </h2>
      <p className="mt-3 text-pretty text-muted-foreground sm:mt-4 sm:text-lg">
        {chapter.pitch}
      </p>
      {chapter.parts ? (
        <dl className="mt-5 grid grid-cols-2 gap-x-4 text-sm sm:mt-6 sm:grid-cols-1">
          {chapter.parts.map((part) => (
            <div
              key={part.name}
              className="grid gap-x-4 border-t border-border py-2 sm:grid-cols-[8.5rem_1fr] sm:py-2.5"
            >
              <dt className="font-mono text-[13px] text-foreground">
                {part.name}
              </dt>
              <dd className="text-muted-foreground max-sm:sr-only">
                {part.line}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <ul className="mt-5 text-sm text-muted-foreground sm:mt-6">
          {chapter.specifics.map((specific) => (
            <li
              key={specific}
              className="border-t border-border py-2 sm:py-2.5"
            >
              {specific}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
        <Status status={chapter.status} />
        {chapter.status === 'alpha' && (
          <ToolkitLink
            id="kabuki"
            className="group -my-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium"
          >
            Read the docs
            <ArrowRightIcon className="size-4 transition-transform duration-150 ease-out group-hover:translate-x-0.5 motion-reduce:transition-none" />
          </ToolkitLink>
        )}
      </div>
    </Stop>
  );
}
