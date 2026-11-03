import type { ComponentType } from 'react';
import type { MDXProps } from 'mdx/types';
import { packageOf } from '../../shared/index.ts';
import type { Package } from '../../shared/index.ts';
import { Pager } from './pager.tsx';
import { prose } from './prose.tsx';
import { Sidebar } from './sidebar.tsx';
import { column, label } from './styles.ts';
import { FoldedToc, Toc } from './toc.tsx';
import type { Heading } from './toc.tsx';

/*
 * A package's docs page, in its place: the sidebar beside it from the `lg`
 * width; above its title, its section and group, and a Part's import path;
 * then what it is about, its MDX, and the pages before and after it. Its
 * headings are listed beside it from the `xl` width.
 */

export type Written = {
  readonly Content: ComponentType<MDXProps>;
  readonly headings: ReadonlyArray<Heading>;
};

export function DocsPage({
  id,
  slug,
  page,
}: {
  readonly id: Package['id'];
  readonly slug: string;
  readonly page: Written;
}) {
  const { docOf, sectionOf, groupOf } = packageOf(id).contents;
  const doc = docOf(slug);
  const section = sectionOf(slug);
  const group = groupOf(slug);
  const { Content, headings } = page;
  return (
    <div className={`${column} grid gap-10 lg:grid-cols-[15rem_minmax(0,1fr)]`}>
      <aside className="hidden lg:block">
        <div
          data-sidebar-scroll
          className="sticky top-14 -ml-2 h-[calc(100dvh-3.5rem)] overflow-y-auto overscroll-contain border-r border-border py-8 pr-4"
        >
          <Sidebar id={id} />
        </div>
      </aside>
      <main className="min-w-0 py-8 lg:py-10">
        <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_12rem]">
          <article className="min-w-0 space-y-8">
            <header className="space-y-3">
              <p className={label}>
                {section.title}
                {group.title && ` · ${group.title}`}
                {section.path && (
                  <code className="ml-2 font-mono text-[11px] font-normal">
                    {section.path}
                  </code>
                )}
              </p>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                {doc.title}
              </h1>
              <p className="text-lg text-pretty text-muted-foreground">
                {doc.summary}
              </p>
            </header>
            <FoldedToc headings={headings} />
            <div className="max-w-3xl">
              <Content components={prose} />
            </div>
            <Pager id={id} slug={slug} />
          </article>
          <aside className="hidden xl:block">
            <div className="sticky top-24">
              <Toc headings={headings} />
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
