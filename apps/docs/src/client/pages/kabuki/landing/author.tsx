import { Router } from '@kestack/kabuki/routing';
import { ArrowRightIcon } from '@kestack/web-platform/components/lucide';
import { router } from '../../../../shared/index.ts';
import { Chapter } from './chapter.tsx';
import { AUTHOR } from './story.ts';

/*
 * The end of the page: who makes kabuki and where he is, then where to go
 * next, the docs or back to the rest of the stack.
 */

const away =
  '-my-3 inline-flex min-h-11 items-center underline decoration-border underline-offset-4 transition-colors duration-150 hover:text-foreground hover:decoration-foreground motion-reduce:transition-none';

export function Author() {
  return (
    <Chapter
      shape={AUTHOR.shape}
      label={AUTHOR.label}
      id="author"
      title={`Made by ${AUTHOR.name}.`}
    >
      <div className="mt-5 flex items-center gap-4 sm:mt-6">
        <img
          src={AUTHOR.avatar}
          alt={AUTHOR.name}
          width={48}
          height={48}
          loading="lazy"
          decoding="async"
          className="size-12 shrink-0 rounded-full border border-border bg-muted"
        />
        <p className="flex flex-wrap items-center gap-x-3 font-mono text-[13px] text-muted-foreground">
          <a
            href={AUTHOR.github.href}
            target="_blank"
            rel="noreferrer"
            className={away}
          >
            {AUTHOR.github.handle}
          </a>
          <span aria-hidden>·</span>
          <a
            href={AUTHOR.site.href}
            target="_blank"
            rel="noreferrer"
            className={away}
          >
            {AUTHOR.site.label}
          </a>
        </p>
      </div>
      <p className="mt-4 text-pretty text-muted-foreground sm:text-lg">
        {AUTHOR.line.before}
        <a
          href={AUTHOR.monorepo}
          target="_blank"
          rel="noreferrer"
          className="text-foreground underline decoration-border underline-offset-4 transition-colors duration-150 hover:decoration-foreground motion-reduce:transition-none"
        >
          {AUTHOR.line.link}
        </a>
        {AUTHOR.line.after}
      </p>
      <div className="mt-6 flex flex-wrap gap-3 sm:mt-8">
        <Router.Link
          to={router.Kabuki.Doc({ slug: 'quick-start' })}
          className="group inline-flex h-11 items-center gap-1.5 rounded-full bg-foreground px-5 text-sm font-medium text-background"
        >
          Quick start
          <ArrowRightIcon className="size-4 transition-transform duration-150 ease-out group-hover:translate-x-0.5 motion-reduce:transition-none" />
        </Router.Link>
        <Router.Link
          to={router.Kabuki.Doc({ slug: 'introduction' })}
          className="inline-flex h-11 items-center rounded-full border border-border bg-background px-5 text-sm font-medium transition-colors hover:border-foreground/30"
        >
          Read the introduction
        </Router.Link>
      </div>
      <Router.Link
        to={router.Home()}
        className="mt-4 inline-flex min-h-11 items-center text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground motion-reduce:transition-none"
      >
        The rest of the stack
      </Router.Link>
    </Chapter>
  );
}
