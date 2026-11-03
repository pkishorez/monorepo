import { Page } from '@kestack/kabuki/routing';
import { Schema } from 'effect';
import { STD_TOOLKIT_CONTENTS, about } from '../../content/index.ts';

/*
 * One of std-toolkit's docs pages, by its slug. Only the slugs in the table
 * of contents read, so any other URL is not found.
 */

export const StdToolkitDoc = Page.define({
  path: '/:slug',
  params: { slug: Schema.Literals(STD_TOOLKIT_CONTENTS.slugs) },
  metadata: ({ slug }) => {
    const doc = STD_TOOLKIT_CONTENTS.docOf(slug);
    return about(
      `/std-toolkit/${slug}`,
      `${doc.title} · std-toolkit`,
      doc.summary,
    );
  },
});

export const StdToolkitDocLive = StdToolkitDoc.build();
