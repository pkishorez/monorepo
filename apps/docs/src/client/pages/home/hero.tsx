import { ArrowUpRightIcon } from 'lucide-react';
import { Stop } from '../../field/index.ts';

/*
 * The first Stop: one line for the whole stack, in two lines that never
 * break inside themselves, then what is in it so far and the way to its
 * code. The monorepo is linked twice: the word itself, and a button under
 * the words for whoever reads past it.
 */

export const MONOREPO = 'https://github.com/pkishorez/monorepo';

export function Hero() {
  return (
    <Stop shape="hero" side="right" first data-chapter aria-label="ke stack">
      <p className="font-mono text-sm text-muted-foreground">ke stack</p>
      <h1 className="mt-5 text-[clamp(2rem,9.5vw,2.5rem)] leading-[1.08] font-semibold tracking-tight sm:text-6xl lg:text-[3.5rem] xl:text-[4.25rem]">
        <span className="whitespace-nowrap">Everything I build,</span>
        <br />
        <span className="whitespace-nowrap">
          in one{' '}
          <a
            href={MONOREPO}
            target="_blank"
            rel="noreferrer"
            // The underline is a bar in the text's own colour that rises behind
            // the word on hover, as high as its letters and no higher, so it
            // never touches the line above.
            className="-ml-1 rounded-md bg-linear-to-r from-foreground to-foreground bg-size-[100%_0.06em] bg-bottom bg-no-repeat px-1 transition-[background-size,color] duration-150 ease-out hover:bg-size-[100%_76%] hover:text-background focus-visible:bg-size-[100%_76%] focus-visible:text-background motion-reduce:transition-none"
          >
            monorepo
          </a>
          .
        </span>
      </h1>
      <p className="mt-6 max-w-lg text-lg text-pretty text-muted-foreground">
        All open source. The first piece to read is kabuki, a UI framework where
        an app is one tree of Actors.
      </p>
      <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
        <a
          href={MONOREPO}
          target="_blank"
          rel="noreferrer"
          className="group inline-flex h-11 items-center gap-1.5 rounded-full border border-border bg-background px-5 text-sm font-medium transition-[border-color,transform] duration-150 ease-out hover:border-foreground/30 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none"
        >
          The code on GitHub
          <ArrowUpRightIcon className="size-4 transition-transform duration-150 ease-out group-hover:translate-x-0.5 group-hover:-translate-y-0.5 motion-reduce:transition-none" />
        </a>
        <p
          aria-hidden
          className="flex items-center gap-3 font-mono text-xs text-muted-foreground"
        >
          <span className="h-px w-8 bg-border" />
          scroll
        </p>
      </div>
    </Stop>
  );
}
