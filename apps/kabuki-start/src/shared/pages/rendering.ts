import { Schema } from 'effect';
import { Page } from '@kestack/kabuki/routing';
import { about } from './metadata.ts';

/*
 * The three Render Modes, one page inside the next, each adding a segment
 * to the URL: `/` is static, `/dynamic` adds a dynamic page inside it, and
 * `/dynamic/client` a client page inside that. A URL names one page per
 * level, so nesting is how three modes share a screen; and `/` alone is
 * all static, which is what lets a build keep it for everyone. Each Loader
 * says when it ran.
 */

/** When its Loader ran, in ms since the epoch. */
const Ran = Schema.Struct({ at: Schema.Number });

export const Client = Page.define({
  path: '/client',
  render: 'client',
  data: Ran,
  metadata: about(
    '/dynamic/client',
    'Client',
    'A client page inside a dynamic one inside a static one.',
  ),
});

export const Dynamic = Page.define({
  path: '/dynamic',
  render: 'dynamic',
  data: Ran,
  pages: { Client },
  metadata: about('/dynamic', 'Dynamic', 'A dynamic page inside a static one.'),
});

export const Static = Page.define({
  path: '/',
  data: Ran,
  pages: { Dynamic },
  metadata: about(
    '/',
    'Rendering',
    'Static, dynamic and client pages, nested, each saying what drew it and when.',
  ),
});

export const ClientLive = Page.build(Client);
export const DynamicLive = Page.build(Dynamic, {
  pages: { Client: ClientLive },
});
export const StaticLive = Page.build(Static, {
  pages: { Dynamic: DynamicLive },
});
