import { Schema } from 'effect';
import type { PlaceSchema } from '../../../routing/route/index.ts';

/*
 * The Static Data: what a build keeps of each static place, so its Loader runs
 * once per build and never for a request. One JSON file per place and
 * path, the place's answer as the Loader RPC writes it, under the build id,
 * so a file never changes and anything in front of the app may keep it for
 * good: a CDN, a service worker, the browser.
 *
 *   GET /_kabuki/data/<build>/Blog.json              { "_tag": "Loaded", "data": … }
 *   GET /_kabuki/data/<build>/Blog.Post/hello.json   one per listed path
 *
 * A path the build did not list has no file: its place is not found. Beside
 * them the build writes each static page's HTML, at its own URL:
 *
 *   /            index.html
 *   /blog/hello  blog/hello.html
 */

/** Where a build keeps the Static Data, from the client's files. */
export const DATA = '_kabuki/data';

/** Where one build's Static Data is served: `/_kabuki/data/<build>`, under Vite's `base`. */
export const dataRoot = (base: string, build: string) =>
  `${base}${DATA}/${encodeURIComponent(build)}`;

/** What the Static Data needs of a place: its name, and the path params down to it. */
type Kept = Pick<PlaceSchema, 'name' | 'params' | 'keys'>;

/** A place's path params as its URL writes them, in its URL's order. */
export const segmentsOf = (
  place: Kept,
  params: Readonly<Record<string, unknown>>,
): ReadonlyArray<string> => {
  const written = Schema.encodeUnknownSync(place.params)(params) as Readonly<
    Record<string, unknown>
  >;
  return place.keys.map((key) => String(written[key]));
};

/** Where a static place's answer is, from a build's Static Data: `/Blog.Post/hello.json`. */
export const dataPath = (
  place: Kept,
  params: Readonly<Record<string, unknown>>,
) =>
  `/${place.name}${segmentsOf(place, params)
    .map((segment) => `/${encodeURIComponent(segment)}`)
    .join('')}.json`;

/** One segment of a file's path, or why a build cannot write it: a host finds a file by the URL's path as it reads it. */
const segmentOf = (segment: string, of: string) => {
  if (
    segment === '' ||
    segment === '.' ||
    segment === '..' ||
    /[/\\\0]/.test(segment)
  )
    throw new Error(
      `[@kestack/kabuki/start] ${of} cannot be written as a file: ${JSON.stringify(segment)} is no file's name`,
    );
  return segment;
};

/** The file a build writes a static place's answer to, from its Static Data's folder: `Blog.Post/hello.json`. */
export const dataFile = (
  place: Kept,
  params: Readonly<Record<string, unknown>>,
) =>
  `${[
    place.name,
    ...segmentsOf(place, params).map((segment) =>
      segmentOf(segment, `${place.name} at ${JSON.stringify(params)}`),
    ),
  ].join('/')}.json`;

/** The file a build writes a static page's HTML to, from the client's files: `/blog/hello` is `blog/hello.html`, `/` is `index.html`. */
export const pageFile = (path: string) => {
  const segments = path
    .split('?')[0]!
    .split('/')
    .filter(Boolean)
    .map((segment) => segmentOf(decodeURIComponent(segment), path));
  return segments.length === 0 ? 'index.html' : `${segments.join('/')}.html`;
};
