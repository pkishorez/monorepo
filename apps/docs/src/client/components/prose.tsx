import type { ComponentProps, ReactNode } from 'react';
import { Router } from '@kestack/kabuki/routing';
import { ArrowUpRightIcon } from 'lucide-react';
import type { MDXComponents } from 'mdx/types';
import { DEMO, SLUGS, router } from '../../shared/index.ts';
import type { Route, Slug } from '../../shared/index.ts';
import { Files, Live, Picture, Run } from './examples/index.ts';
import { link } from './styles.ts';

/*
 * How a docs page's MDX is drawn: every Markdown element, and the few
 * components any page uses without importing them: `<Callout>`, and the
 * three ways a page shows something working, `<Picture>` for an animated
 * picture, `<Live>` for an app running, `<Run>` for code that logs to a
 * console, and `<Files>` for the code behind a demo. A link
 * to a place on the site is a Router link; a link to a page the site
 * does not have fails the page, so it is caught before it ships. A link to the full-screen demo opens it in a new tab.
 */

/** The site's Route for an internal path; one it does not have throws. */
const routeOf = (href: string): Route => {
  const path = href.split('#')[0]!.replace(/\/$/, '');
  if (path === '') return router.Home();
  if (path === '/kabuki') return router.Kabuki();
  const slug = path.match(/^\/kabuki\/([^/]+)$/)?.[1];
  if (slug && (SLUGS as ReadonlyArray<string>).includes(slug))
    return router.Kabuki.Doc({ slug: slug as Slug });
  throw new Error(`A docs page links to ${href}, which is not on the site.`);
};

function A({ href = '', children }: ComponentProps<'a'>) {
  // The demo is full screen, so it opens in a tab of its own.
  if (href === DEMO.href)
    return (
      <a href={href} target="_blank" rel="noreferrer" className={link}>
        {children}
        <ArrowUpRightIcon className="ml-0.5 inline size-3.5 align-[-0.1em]" />
      </a>
    );
  if (!href.startsWith('/'))
    return (
      <a href={href} className={link}>
        {children}
      </a>
    );
  const hash = href.split('#')[1];
  return (
    <Router.Link
      to={routeOf(href)}
      {...(hash ? { hash } : {})}
      className={link}
    >
      {children}
    </Router.Link>
  );
}

function H2({ id, children }: ComponentProps<'h2'>) {
  return (
    <h2
      id={id}
      className="group mt-14 scroll-mt-20 text-2xl font-semibold tracking-tight first:mt-0"
    >
      <a href={`#${id}`}>{children}</a>
    </h2>
  );
}

function H3({ id, children }: ComponentProps<'h3'>) {
  return (
    <h3
      id={id}
      className="mt-10 scroll-mt-20 text-lg font-semibold tracking-tight"
    >
      <a href={`#${id}`}>{children}</a>
    </h3>
  );
}

/** A note beside the text: something to watch for, or worth knowing. */
export function Callout({
  title,
  children,
}: {
  readonly title?: string;
  readonly children: ReactNode;
}) {
  return (
    <aside className="my-6 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm leading-6 [&>p]:my-0 [&>p+p]:mt-2">
      {title && <p className="font-medium">{title}</p>}
      {children}
    </aside>
  );
}

function Pre({ className, ...props }: ComponentProps<'pre'>) {
  return (
    <pre
      className={`${className ?? ''} my-6 overflow-x-auto rounded-xl border border-border p-4 text-[13px] leading-6`}
      {...props}
    />
  );
}

export const prose: MDXComponents = {
  a: A,
  h2: H2,
  h3: H3,
  p: (props) => <p className="my-5 leading-7" {...props} />,
  ul: (props) => (
    <ul className="my-5 list-disc space-y-2 pl-6 leading-7" {...props} />
  ),
  ol: (props) => (
    <ol className="my-5 list-decimal space-y-2 pl-6 leading-7" {...props} />
  ),
  strong: (props) => <strong className="font-semibold" {...props} />,
  hr: () => <hr className="my-12 border-border" />,
  // A table scrolls inside itself on a phone, never the page.
  table: (props) => (
    <div className="my-6 overflow-x-auto rounded-xl border border-border">
      <table className="w-full border-collapse text-sm" {...props} />
    </div>
  ),
  thead: (props) => <thead className="bg-muted/40" {...props} />,
  th: (props) => (
    <th
      className="border-b border-border px-4 py-2.5 text-left text-xs font-medium whitespace-nowrap text-muted-foreground"
      {...props}
    />
  ),
  td: (props) => (
    <td
      className="border-b border-border px-4 py-2.5 align-top leading-6 [tr:last-child_&]:border-b-0"
      {...props}
    />
  ),
  blockquote: (props) => (
    <blockquote
      className="my-6 border-l-2 border-border pl-4 text-muted-foreground"
      {...props}
    />
  ),
  // Shiki colours a block; a bare `code` is inline, in running text.
  pre: Pre,
  code: (props) => (
    <code
      className="rounded bg-muted px-1 py-0.5 font-mono text-[0.875em] [pre_&]:bg-transparent [pre_&]:p-0 [pre_&]:text-[1em]"
      {...props}
    />
  ),
  Callout,
  Picture,
  Live,
  Run,
  Files,
};
