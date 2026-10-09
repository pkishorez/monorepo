import { Effect, Schema, Stream } from 'effect';
import { Node } from 'effect-oak';
import { BrowseSchema, browseFrom, oneOf, printSorting } from './browse.js';
import { makeParam } from './param/index.js';
import { DIETS, PERIODS, nextSorting } from './table/index.js';
import { Url } from './url/index.js';

/*
 * A dinosaur table whose filters, search and sorting live in the URL.
 *
 * There is no router: the URL is a Service, and every Node that draws part of
 * it listens to it with a Lifetime. The app reads all of it to draw the
 * table and writes the sorting when a header is clicked; the search box and
 * the two filters are Param Children, each mirroring and writing its own
 * parameter. The address bar is the only place they meet.
 */

const Column = Schema.Literals(['Name', 'Period', 'Diet', 'Length', 'Weight']);

export const SearchParam = makeParam({ name: 'search' });
export const DietParam = makeParam({ name: 'diet', parse: oneOf(DIETS) });
export const PeriodParam = makeParam({ name: 'period', parse: oneOf(PERIODS) });

export const QuerySync = Node.make('QuerySync', {
  requires: { url: Url },
  model: Schema.Struct({ browse: BrowseSchema }),
  message: Schema.TaggedUnion({
    ChangedUrl: { query: Schema.String },
    ClickedColumnHeader: { column: Column },
  }),
  children: { search: SearchParam, diet: DietParam, period: PeriodParam },
}).build({
  init: () => ({ model: { browse: browseFrom('') } }),
  lifetime: () =>
    Stream.unwrap(
      Effect.gen(function* () {
        return (yield* Url).query;
      }),
    ).pipe(Stream.map((query) => ({ _tag: 'ChangedUrl' as const, query }))),
  update: {
    ChangedUrl: ({ query }) => ({ model: { browse: browseFrom(query) } }),
    ClickedColumnHeader: ({ column }, { model }) => {
      const sorting = printSorting(nextSorting(model.browse.sorting, column));
      return {
        commands: [
          Effect.gen(function* () {
            yield* (yield* Url).replace({ sorting });
          }),
        ],
      };
    },
  },
});

export { BrowserUrl } from './url/index.js';
