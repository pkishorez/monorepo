import { Router } from '@kestack/kabuki/routing';
import { ArrowRightIcon } from 'lucide-react';
import { router } from '../../../../shared/index.ts';
import { PartLinks, column } from '../../../components/index.ts';
import { ENDING } from './story.ts';

/*
 * The end of the page, past the story: where to go next. The field has
 * faded away by here, so it takes the whole width, centred: the docs' four
 * Parts in a row, the quick start and the introduction; and under them,
 * quietly, the way back to the rest of the stack kabuki is part of. It is
 * as tall as the room between the header (57px) and the footer (69px,
 * components/footer.tsx), so at the bottom of the page its words sit in
 * the middle of what is left to see.
 */

const focus =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
const press =
  'group inline-flex h-11 items-center gap-1.5 rounded-full px-5 text-sm font-medium transition-[border-color,transform] duration-150 ease-out active:scale-[0.97] motion-reduce:transition-none';

export function Ending() {
  return (
    <section
      aria-labelledby="start"
      className="flex min-h-[calc(100svh-126px)] flex-col justify-center py-12"
    >
      <div
        data-field-end
        className={`${column} flex flex-col items-center text-center`}
      >
        <p className="flex items-center gap-3 font-mono text-xs text-muted-foreground">
          <span aria-hidden className="h-px w-8 bg-border" />
          {ENDING.label}
          <span aria-hidden className="h-px w-8 bg-border" />
        </p>
        <h2
          id="start"
          className="mt-4 text-4xl font-semibold tracking-tight text-balance sm:mt-5 sm:text-6xl"
        >
          {ENDING.title}
        </h2>
        <p className="mt-3 text-pretty text-muted-foreground sm:mt-4 sm:text-lg">
          {ENDING.pitch}
        </p>
        <div className="mt-10 w-full max-w-4xl">
          <PartLinks label="kabuki's four parts" wide />
        </div>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Router.Link
            to={router.Kabuki.Doc({ slug: 'quick-start' })}
            className={`${press} bg-foreground text-background ${focus}`}
          >
            Quick start
            <ArrowRightIcon className="size-4 transition-transform duration-150 ease-out group-hover:translate-x-0.5 motion-reduce:transition-none" />
          </Router.Link>
          <Router.Link
            to={router.Kabuki.Doc({ slug: 'introduction' })}
            className={`${press} border border-border bg-background hover:border-foreground/30 ${focus}`}
          >
            Read the introduction
          </Router.Link>
        </div>
        <p className="mt-16 font-mono text-xs text-muted-foreground">
          Part of{' '}
          <Router.Link
            to={router.Home()}
            className="-my-3 inline-flex min-h-11 items-center text-foreground underline decoration-border underline-offset-4 transition-colors duration-150 hover:decoration-foreground motion-reduce:transition-none"
          >
            ke stack
          </Router.Link>
        </p>
      </div>
    </section>
  );
}
