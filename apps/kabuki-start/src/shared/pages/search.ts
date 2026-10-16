import { Schema } from 'effect';
import { Page, Router } from '@kestack/kabuki/routing';
import { about, Results } from '../data/index.ts';
import { router } from './routes.ts';

/*
 * A search whose query is in the URL, as `?q=`. Its Loader reads the query,
 * so a new one loads again on the same page, the results shown meanwhile.
 * What is typed is the page's own Model: each keystroke replaces the entry,
 * so Back skips them, and says `resetScroll: false`, so the page stays
 * where it is as the query changes.
 */

export const Search = Page.define({
  path: '/search',
  query: { q: Schema.optionalKey(Schema.String) },
  render: 'dynamic',
  data: Results,
  metadata: about(
    '/search',
    'Search',
    'A query in the URL, loaded again as it changes.',
  ),
  model: Schema.Struct({ typed: Schema.NullOr(Schema.String) }),
  message: Schema.TaggedUnion({ Typed: { text: Schema.String } }),
});

export const SearchLive = Page.build(Search, {
  init: () => ({ model: { typed: null } }),
  on: {
    Typed: ({ text }) => ({
      model: { typed: text },
      command: Router.replace(router.Search(text ? { q: text } : {}), {
        resetScroll: false,
      }),
    }),
  },
});
