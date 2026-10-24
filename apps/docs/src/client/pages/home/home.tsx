import { View } from '@kestack/kabuki/react';
import { ArrowRightIcon } from '@kestack/web-platform/ui/components/lucide';
import { Pages, TOOLKITS } from '../../../shared/index.ts';
import type { Toolkit } from '../../../shared/index.ts';
import { ToolkitLink, column } from '../../components/index.ts';
import { ActorTree } from './actor-tree.tsx';

/*
 * The stack's home: one line for the whole stack, its monorepo linked, and
 * what is here; then, under a rule that counts them, a
 * door per toolkit, numbered: its name, its pitch, and a picture of what it
 * does.
 */

function Door({
  toolkit,
  index,
}: {
  readonly toolkit: Toolkit;
  readonly index: number;
}) {
  return (
    <ToolkitLink
      id={toolkit.id}
      className="group grid overflow-hidden rounded-3xl border border-border bg-card transition-colors hover:border-foreground/25 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]"
    >
      <div className="flex flex-col gap-6 p-8 sm:p-12">
        <p className="flex items-center gap-3 font-mono text-xs text-muted-foreground">
          <span className="tabular-nums">
            {`${index + 1}`.padStart(2, '0')}
          </span>
          <span className="h-px w-8 bg-border" />
          {toolkit.kind}
        </p>
        <h2 className="text-6xl font-semibold tracking-tight sm:text-7xl">
          {toolkit.name}
        </h2>
        <p className="max-w-md text-lg text-pretty text-muted-foreground">
          {toolkit.pitch}
        </p>
        <span className="mt-auto flex items-center gap-1.5 pt-4 text-sm font-medium">
          Read the docs
          <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-1" />
        </span>
      </div>
      <div className="relative min-h-72 border-t border-border bg-muted/30 lg:border-t-0 lg:border-l">
        <ActorTree />
      </div>
    </ToolkitLink>
  );
}

export const HomeView = View.make(Pages.HomeLive, () => (
  <main className="pb-24">
    <section className="relative isolate overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[radial-gradient(var(--color-border)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_70%)] bg-[size:22px_22px]"
      />
      <div className={`${column} pt-20 pb-20 sm:pt-28 sm:pb-28`}>
        <p className="font-mono text-sm text-muted-foreground">ke stack</p>
        <h1 className="mt-5 text-5xl leading-[1.15] font-semibold tracking-tight sm:text-6xl">
          Everything I build,
          <br />
          in one{' '}
          <a
            href="https://github.com/pkishorez/monorepo"
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
        </h1>
        <p className="mt-6 max-w-lg text-lg text-pretty text-muted-foreground">
          Open source on GitHub. Each package gets a page here, with examples
          you can run.
        </p>
      </div>
    </section>
    <section aria-labelledby="inside" className={`${column} space-y-6`}>
      <div className="flex items-center gap-4 font-mono text-xs text-muted-foreground">
        <h2 id="inside">inside</h2>
        <span className="h-px flex-1 bg-border" />
        <span className="tabular-nums">
          {TOOLKITS.length} {TOOLKITS.length === 1 ? 'package' : 'packages'}
        </span>
      </div>
      {TOOLKITS.map((toolkit, index) => (
        <Door key={toolkit.id} toolkit={toolkit} index={index} />
      ))}
    </section>
  </main>
));
