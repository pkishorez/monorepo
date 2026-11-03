import { Page } from '@kestack/kabuki/routing';
import { Schema } from 'effect';
import { KABUKI_CONTENTS, about } from '../../content/index.ts';

/*
 * One of kabuki's docs pages, by its slug. Only the slugs in the table of
 * contents read, so any other URL is not found.
 */

export const Doc = Page.define({
  path: '/:slug',
  params: { slug: Schema.Literals(KABUKI_CONTENTS.slugs) },
  metadata: ({ slug }) => {
    const doc = KABUKI_CONTENTS.docOf(slug);
    return about(`/kabuki/${slug}`, `${doc.title} · kabuki`, doc.summary);
  },
});

export const DocLive = Doc.build();
