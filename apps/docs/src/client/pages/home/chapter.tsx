import { Router } from '@kestack/kabuki/routing';
import { ArrowRightIcon } from 'lucide-react';
import { router } from '../../../shared/index.ts';
import { PartLinks, button } from '../../components/index.ts';
import { Stop } from '../../field/index.ts';
import type { Chapter as Story } from './chapters.ts';

/*
 * One chapter of the story, a Stop on the field: its act, the package's
 * name and pitch, its docs' four Parts, and the way into the docs.
 */

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
      <div className="mt-6">
        <PartLinks label={`${chapter.name}'s four parts`} />
      </div>
      <Router.Link
        to={router.Kabuki.Doc({ slug: 'introduction' })}
        className={`mt-6 ${button.solid}`}
      >
        Read the docs
        <ArrowRightIcon className="size-4 transition-transform duration-150 ease-out group-hover:translate-x-0.5 motion-reduce:transition-none" />
      </Router.Link>
    </Stop>
  );
}
