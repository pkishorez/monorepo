import { Page } from '@kestack/kabuki/routing';

/*
 * `/kabuki`, open signed in or not: Kabuki's Inspector on code's own
 * Actor tree, from DevTools Kabuki. This Page only holds their place in code,
 * so it keeps nothing.
 */

export const Kabuki = Page.define({
  path: '/kabuki',
  metadata: { title: 'Kabuki · code', robots: 'noindex' },
});

export const KabukiLive = Page.build(Kabuki, {});
