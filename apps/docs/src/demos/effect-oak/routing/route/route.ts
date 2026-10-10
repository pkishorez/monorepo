import { Schema } from 'effect';
import { readPath } from '../../location/index.js';

/*
 * The routes, as the root's States, and the paths that lead to them. A path
 * gives exactly one route; anything else is NotFound with the path kept.
 * `Opening` is the State before the first path arrives: init cannot read the
 * URL.
 */

export const RouteState = Schema.TaggedUnion({
  Opening: {},
  Home: {},
  Nested: {},
  People: {},
  Person: { personId: Schema.Number },
  FilesIndex: {},
  Files: { path: Schema.Array(Schema.String) },
  NotFound: { path: Schema.String },
});
type RouteState = typeof RouteState.Type;

const NESTED = ['nested', 'route', 'is', 'very', 'nested'];

export const paths = {
  home: '/',
  nested: `/${NESTED.join('/')}`,
  people: (search = '') =>
    search === '' ? '/people' : `/people?q=${encodeURIComponent(search)}`,
  person: (personId: number) => `/people/${personId}`,
  files: (segments: ReadonlyArray<string> = []) =>
    ['/files', ...segments.map(encodeURIComponent)].join('/'),
};

export const routeFrom = (path: string): RouteState => {
  const { segments } = readPath(path);
  const [first, second, ...rest] = segments;
  if (first === undefined) return { _tag: 'Home' };
  if (segments.join('/') === NESTED.join('/')) return { _tag: 'Nested' };
  if (first === 'people' && second === undefined) return { _tag: 'People' };
  if (first === 'people' && rest.length === 0 && /^\d+$/.test(second ?? ''))
    return { _tag: 'Person', personId: Number(second) };
  if (first === 'files')
    return second === undefined
      ? { _tag: 'FilesIndex' }
      : { _tag: 'Files', path: segments.slice(1) };
  return { _tag: 'NotFound', path };
};

/** The search on a People path, or null on any other path. */
export const searchOn = (path: string): string | null => {
  const { segments, query } = readPath(path);
  return segments.length === 1 && segments[0] === 'people'
    ? (query.get('q') ?? '')
    : null;
};
