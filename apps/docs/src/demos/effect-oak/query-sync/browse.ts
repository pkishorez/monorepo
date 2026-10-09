import { Schema } from 'effect';
import { DIETS, PERIODS } from './table/index.js';
import type { Browse, Sorting } from './table/index.js';

/*
 * The query string read as what the table shows, and back. Sorting is
 * written `sorting=Length:Ascending`, as in Foldkit; anything the app does not
 * know is read as no filter.
 */

const Column = Schema.Literals(['Name', 'Period', 'Diet', 'Length', 'Weight']);
const Direction = Schema.Literals(['Ascending', 'Descending']);

export const BrowseSchema = Schema.Struct({
  search: Schema.String,
  diet: Schema.String,
  period: Schema.String,
  sorting: Schema.NullOr(
    Schema.Struct({ column: Column, direction: Direction }),
  ),
});

const SEPARATOR = ':';

/** Keep the value only if it is one of the known ones. */
export const oneOf =
  (known: ReadonlyArray<string>) =>
  (raw: string): string =>
    known.includes(raw) ? raw : '';

const sortingFrom = (raw: string): Sorting => {
  const [column, direction] = raw.split(SEPARATOR);
  return Schema.is(Column)(column) && Schema.is(Direction)(direction)
    ? { column, direction }
    : null;
};

export const printSorting = (sorting: Sorting) =>
  sorting ? `${sorting.column}${SEPARATOR}${sorting.direction}` : '';

export const browseFrom = (query: string): Browse => {
  const params = new URLSearchParams(query);
  const get = (name: string) => params.get(name) ?? '';
  return {
    search: get('search'),
    diet: oneOf(DIETS)(get('diet')),
    period: oneOf(PERIODS)(get('period')),
    sorting: sortingFrom(get('sorting')),
  };
};
