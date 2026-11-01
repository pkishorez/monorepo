import { ArrowUpRightIcon } from 'lucide-react';
import { Stop } from '../../field/index.ts';
import { MONOREPO } from '../../../shared/index.ts';

/*
 * The end of the story: more is coming, drawn as packages being built
 * beside the one that is. Its shape takes the right, as the opening's
 * did, so the sides alternate down the page; the way to follow along is
 * the code.
 */

export function Outro() {
  return (
    <Stop shape="outro" side="right" last data-chapter aria-labelledby="outro">
      <h2
        id="outro"
        className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl"
      >
        Coming soon.
      </h2>
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
