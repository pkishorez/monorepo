import { View } from '@kestack/kabuki/react';
import { Pages, docOf, groupOf, sectionOf } from '../../../shared/index.ts';
import { label, prose } from '../../components/index.ts';
import { KABUKI } from '../../docs/index.ts';
import { Pager } from './pager.tsx';
import { FoldedToc, Toc } from './toc.tsx';

/*
 * One docs page: its section and title, what it is about, its MDX, and the
 * pages before and after it. Its headings are listed beside it from the
 * `xl` width. Above its title, its section and group; a Part's page says
 * its import path too.
 */

export const DocView = View.make(Pages.DocLive, ({ props }) => {
  const { slug } = props.params;
  const doc = docOf(slug);
  const section = sectionOf(slug);
  const group = groupOf(slug);
  const page = KABUKI[slug];
  const { headings } = page;
  return (
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
          <page.Content components={prose} />
        </div>
        <Pager slug={slug} />
      </article>
      <aside className="hidden xl:block">
        <div className="sticky top-24">
          <Toc headings={headings} />
        </div>
      </aside>
    </div>
  );
});
