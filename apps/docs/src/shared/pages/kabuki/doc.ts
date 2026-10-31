import { Page } from '@kestack/kabuki/routing';
import { Schema } from 'effect';
import { SLUGS, about, docOf } from '../../content/index.ts';

/*
 * One of kabuki's docs pages, by its slug. Only the slugs in the table of
 * contents read, so any other URL is not found.
 */

export const Doc = Page.define({
  path: '/:slug',
  params: { slug: Schema.Literals(SLUGS) },
  metadata: ({ slug }) => {
    const doc = docOf(slug);
    return about(`/kabuki/${slug}`, `${doc.title} · kabuki`, doc.summary);
  },
});

export const DocLive = Doc.build();
