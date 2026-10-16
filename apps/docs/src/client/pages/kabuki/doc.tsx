import { View } from '@kestack/kabuki/react';
import { Pages, anchor, docOf, sectionOf } from '../../../shared/index.ts';
import type { Doc } from '../../../shared/index.ts';
import { SoonBadge, label, prose } from '../../components/index.ts';
import { KABUKI } from '../../docs/index.ts';
import type { Heading } from '../../docs/index.ts';
import { Outline } from './outline.tsx';
import { Pager } from './pager.tsx';
import { FoldedToc, Toc } from './toc.tsx';

/*
 * One docs page: its section and title, what it is about, its MDX, and the
 * pages before and after it. Its headings are listed beside it from the
 * `xl` width. A page not written yet draws its outline instead.
 */

const outlineOf = (doc: Doc): ReadonlyArray<Heading> =>
  doc.soon
    ? doc.outline.map((title) => ({ id: anchor(title), title, depth: 2 }))
    : [];

export const DocView = View.make(Pages.DocLive, ({ props }) => {
  const { slug } = props.params;
  const doc = docOf(slug);
  const section = sectionOf(slug);
  const page = doc.soon ? undefined : KABUKI[slug as keyof typeof KABUKI];
  const headings = page ? page.headings : outlineOf(doc);
  return (
    <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_12rem]">
      <article className="min-w-0 space-y-8">
        <header className="space-y-3">
          <p className={label}>{section.title}</p>
          <h1 className="flex flex-wrap items-center gap-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            {doc.title}
            {doc.soon && <SoonBadge className="h-5 text-xs" />}
          </h1>
          <p className="text-lg text-pretty text-muted-foreground">
            {doc.summary}
          </p>
        </header>
        <FoldedToc headings={headings} />
        {page ? (
          <div className="max-w-3xl">
            <page.Content components={prose} />
          </div>
        ) : (
          <Outline headings={headings} />
        )}
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
