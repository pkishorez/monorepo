import { Children, Fragment, isValidElement, useState } from 'react';
import type { ComponentProps, ReactElement, ReactNode } from 'react';
import { Router } from '@kestack/kabuki/routing';
import type { MDXComponents } from 'mdx/types';
import { SLUGS, router } from '../../shared/index.ts';
import type { Route, Slug } from '../../shared/index.ts';
import { link } from './styles.ts';

/*
 * How a docs page's MDX is drawn: every Markdown element, and the few
 * components any page uses without importing them, `<Callout>` and `<Demo>`.
 * A link to a place on the site is a Router link; a link to a page the site
 * does not have fails the page, so it is caught before it ships.
 */

/** The site's Route for an internal path; one it does not have throws. */
const routeOf = (href: string): Route => {
  const path = href.split('#')[0]!.replace(/\/$/, '');
  if (path === '') return router.Home();
  if (path === '/kabuki') return router.Kabuki();
  if (path === '/kabuki/demos/opening-an-app') return router.Kabuki.Demo();
  const slug = path.match(/^\/kabuki\/([^/]+)$/)?.[1];
  if (slug && (SLUGS as ReadonlyArray<string>).includes(slug))
    return router.Kabuki.Doc({ slug: slug as Slug });
  throw new Error(`A docs page links to ${href}, which is not on the site.`);
};

function A({ href = '', children }: ComponentProps<'a'>) {
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

type FileBlock = ReactElement<{ readonly 'data-file'?: string }>;

const tab =
  'flex h-10 shrink-0 items-center gap-2 border-b-2 border-transparent px-3 text-sm text-muted-foreground hover:text-foreground aria-selected:border-foreground aria-selected:text-foreground';

/**
 * A live example on the page, and a line under it on what to try. Code
 * blocks written inside it that include a file become tabs beside its
 * Output, one per file, all the same height, so switching moves nothing.
 * The Output stays mounted under another tab, so the app keeps running.
 */
export function Demo({
  caption,
  children,
}: {
  readonly caption?: string;
  readonly children: ReactNode;
}) {
  const [shown, setShown] = useState<number | null>(null);
  // MDX hands each code block over inside a Fragment of its own.
  const parts = Children.toArray(children).flatMap((part) =>
    isValidElement<{ readonly children?: ReactNode }>(part) &&
    part.type === Fragment
      ? Children.toArray(part.props.children)
      : [part],
  );
  const files = parts.filter(
    (part): part is FileBlock =>
      isValidElement(part) &&
      typeof (part.props as { 'data-file'?: unknown })['data-file'] ===
        'string',
  );
  const output = parts.filter((part) => !files.includes(part as FileBlock));
  return (
    <figure className="my-8">
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {files.length === 0 ? (
          output
        ) : (
          <>
            <div
              role="tablist"
              className="flex overflow-x-auto border-b border-border bg-muted/30 px-2"
            >
              <button
                type="button"
                role="tab"
                aria-selected={shown === null}
                onClick={() => setShown(null)}
                className={tab}
              >
                <span className="size-1.5 rounded-full bg-emerald-500" />
                Output
              </button>
              {files.map((file, index) => (
                <button
                  key={index}
                  type="button"
                  role="tab"
                  aria-selected={shown === index}
                  onClick={() => setShown(index)}
                  className={`${tab} font-mono text-xs`}
                >
                  {file.props['data-file']}
                </button>
              ))}
            </div>
            <div className="h-96">
              <div role="tabpanel" hidden={shown !== null} className="h-full">
                {output}
              </div>
              {files.map((file, index) => (
                <div
                  key={index}
                  role="tabpanel"
                  hidden={shown !== index}
                  className="h-full [&>pre]:m-0 [&>pre]:h-full [&>pre]:overflow-auto [&>pre]:rounded-none [&>pre]:border-0"
                >
                  {file}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      {caption && (
        <figcaption className="mt-3 text-sm text-muted-foreground">
          {caption}
        </figcaption>
      )}
    </figure>
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
  Demo,
};
