import { Router } from '@kestack/kabuki/routing';
import { ArrowRightIcon } from 'lucide-react';
import { PARTS, router } from '../../../shared/index.ts';
import { Stop } from '../../field/index.ts';
import type { Chapter as Story } from './chapters.ts';

/*
 * One chapter of the story, a Stop on the field: its act, the package's
 * name and pitch, its docs' four Parts in the order they are read, each a
 * way straight to its first page, and the way into the docs. On a phone it
 * fits the room under the stage: the Parts in one row, by name alone.
 */

const focus =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

export function Chapter({ chapter }: { readonly chapter: Story }) {
  const id = `chapter-${chapter.shape}`;
  return (
    <Stop
      shape={chapter.shape}
      side={chapter.side}
      data-chapter
      aria-labelledby={id}
    >
      <p className="flex items-center gap-3 font-mono text-xs text-muted-foreground">
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
      <ol
        aria-label={`${chapter.name}'s four parts`}
        className="mt-6 grid grid-cols-4 gap-px overflow-hidden rounded-2xl border border-border bg-border lg:grid-cols-2"
      >
        {PARTS.map((part, index) => {
          const first = part.groups[0]!.docs[0]!;
          return (
            <li key={part.title} className="bg-background">
              <Router.Link
                to={router.Kabuki.Doc({ slug: first.slug })}
                className={`group flex h-full flex-col gap-1 p-3 transition-colors duration-150 hover:bg-muted/50 lg:p-4 ${focus}`}
              >
                <span className="flex items-center justify-between font-mono text-[11px] text-muted-foreground tabular-nums">
                  {`${index + 1}`.padStart(2, '0')}
                  <ArrowRightIcon className="size-3.5 opacity-0 transition-[opacity,transform] duration-150 group-hover:translate-x-0.5 group-hover:opacity-100 motion-reduce:transition-none" />
                </span>
                <span className="font-semibold tracking-tight">
                  {part.title}
                </span>
                <span className="truncate font-mono text-[11px] text-muted-foreground max-lg:hidden">
                  {part.path}
                </span>
              </Router.Link>
            </li>
          );
        })}
      </ol>
      <Router.Link
        to={router.Kabuki.Doc({ slug: 'introduction' })}
        className={`group mt-6 inline-flex h-11 items-center gap-1.5 rounded-full bg-foreground px-5 text-sm font-medium text-background transition-transform duration-150 ease-out active:scale-[0.97] motion-reduce:transition-none ${focus}`}
      >
        Read the docs
        <ArrowRightIcon className="size-4 transition-transform duration-150 ease-out group-hover:translate-x-0.5 motion-reduce:transition-none" />
      </Router.Link>
    </Stop>
  );
}
