import { Link } from '@tanstack/react-router';
import { ArrowLeftIcon, ArrowRightIcon } from '@kstackz/ui-toolkit/lucide';
import { cn } from '@kstackz/ui-toolkit/utils';
import type { ReactNode } from 'react';
import { chapterOf, neighbours, pageAt } from '../lib/chapters.ts';
import { usePageTurn } from '../page-turn/index.ts';

function PrevNext(props: { readonly path: string }) {
  const { prev, next } = neighbours(props.path);
  if (prev === undefined && next === undefined) return null;
  const linkClass =
    'group flex min-h-16 flex-col justify-center gap-0.5 rounded-lg px-4 py-3 ring-1 ring-edge transition-colors duration-150 hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
  return (
    <nav aria-label="More pages" className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {prev ? (
          <Link to={prev.path} className={linkClass} data-testid="page-prev">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ArrowLeftIcon aria-hidden="true" className="size-3.5" />
              Previous
            </span>
            <span className="text-sm font-medium">{prev.title}</span>
          </Link>
        ) : (
          <span aria-hidden="true" className="max-sm:hidden" />
        )}
        {next ? (
          <Link
            to={next.path}
            className={cn(linkClass, 'sm:items-end sm:text-right')}
            data-testid="page-next"
          >
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Next
              <ArrowRightIcon aria-hidden="true" className="size-3.5" />
            </span>
            <span className="text-sm font-medium">{next.title}</span>
          </Link>
        ) : null}
      </div>
      <p className="text-center text-xs text-muted-foreground">
        <span className="pointer-coarse:hidden">
          <Key>←</Key> <Key>→</Key> turn the page
        </span>
        <span className="hidden pointer-coarse:inline">
          Swipe sideways to turn the page
        </span>
      </p>
    </nav>
  );
}

export function Key(props: { readonly children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-muted px-1 font-sans text-[11px] text-foreground">
      {props.children}
    </kbd>
  );
}

/**
 * One page: chapter, title and a short lede, then the page's sections, then
 * the way on. It declares its neighbours in reading order for Page Turns.
 */
export function Page(props: {
  readonly path: string;
  /** Overrides the registry's title, for a page that renders a state of itself. */
  readonly title?: string;
  readonly lede: ReactNode;
  readonly testId?: string;
  readonly children: ReactNode;
}) {
  const chapter = chapterOf(props.path);
  const { prev, next } = neighbours(props.path);
  usePageTurn({ prev: prev?.path, next: next?.path });
  const title = props.title ?? pageAt(props.path)?.title ?? '';
  return (
    <main
      data-page
      data-testid={props.testId}
      className="flex min-w-0 flex-col gap-10 pt-8 pb-10 lg:pt-12"
    >
      <header className="flex max-w-[62ch] flex-col gap-3">
        {chapter ? (
          <p className="text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">
            {chapter.title}
          </p>
        ) : null}
        <h1 className="font-display text-4xl leading-[1.08] font-medium tracking-[-0.01em] text-balance sm:text-5xl">
          {title}
        </h1>
        <div className="flex flex-col gap-3 text-[17px] leading-relaxed text-pretty text-muted-foreground">
          {props.lede}
        </div>
      </header>
      {props.children}
      <PrevNext path={props.path} />
    </main>
  );
}

/** A titled block of a page, for anything beside the playground. */
export function Section(props: {
  readonly title: string;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <section className={cn('flex flex-col gap-3', props.className)}>
      <h2 className="text-sm font-semibold">{props.title}</h2>
      {props.children}
    </section>
  );
}
