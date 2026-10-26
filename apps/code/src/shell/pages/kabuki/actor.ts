import { Page } from '@kestack/kabuki/routing';

/*
 * A prototype at `/kabuki`, open signed in or not: a tool that draws
 * code's own Actor tree. The tool is a Kabuki app of its own, with its own
 * Actors and History (`devtools/`); this Page only holds its place in
 * code, so it keeps nothing.
 */

export const Kabuki = Page.define({
  path: '/kabuki',
  metadata: { title: 'Kabuki · code', robots: 'noindex' },
});

export const KabukiLive = Page.build(Kabuki, {});
