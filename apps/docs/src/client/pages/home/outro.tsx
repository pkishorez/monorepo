import { ArrowUpRightIcon } from 'lucide-react';
import { Stop } from '../../field/index.ts';
import { MONOREPO } from './hero.tsx';

/*
 * The end of the story: the rest of the stack is on its way, drawn as
 * packages being built beside the one that is. Its shape takes the right,
 * as the opening's did, so the sides alternate down the page; the way to
 * follow along is the code.
 */

export function Outro() {
  return (
    <Stop shape="outro" side="right" last data-chapter aria-labelledby="outro">
      <p className="flex items-center gap-3 font-mono text-xs text-muted-foreground">
        <span aria-hidden className="h-px w-8 bg-border" />
        coming soon
      </p>
      <h2
        id="outro"
        className="mt-4 text-4xl font-semibold tracking-tight text-balance sm:mt-5 sm:text-5xl"
      >
        The rest is on its way.
      </h2>
      <p className="mt-3 max-w-md text-pretty text-muted-foreground sm:mt-4 sm:text-lg">
        Each package joins this page once its docs are ready. Until then, it’s
        all in the monorepo.
      </p>
      <a
        href={MONOREPO}
        target="_blank"
        rel="noreferrer"
        className="group mt-6 inline-flex h-11 items-center gap-1.5 rounded-full border border-border bg-background px-5 text-sm font-medium transition-[border-color,transform] duration-150 ease-out hover:border-foreground/30 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none"
      >
        GitHub
        <ArrowUpRightIcon className="size-4 transition-transform duration-150 ease-out group-hover:translate-x-0.5 group-hover:-translate-y-0.5 motion-reduce:transition-none" />
      </a>
    </Stop>
  );
}
