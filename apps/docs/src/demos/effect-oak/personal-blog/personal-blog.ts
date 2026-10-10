import { Schema, Stream } from 'effect';
import { Actor } from 'effect-oak';
import { Location, heardUrl, pushUrl, readPath } from '../location/index.js';
import { Counter } from './counter/index.js';

/*
 * A small blog: About, the list of posts, and each post.
 *
 * Here the route is Model data, not a State, unlike the routing demos. One
 * post holds a live Counter whose count must survive leaving the post and
 * coming back. A Child lives only as long as its parent's State, so if pages
 * were States the Counter would be destroyed with its page. Instead the blog
 * has one State, the Counter is its Child for the app's whole life, and the
 * View picks the page from the path.
 */

export type Page =
  | { readonly _tag: 'Opening' }
  | { readonly _tag: 'Home' }
  | { readonly _tag: 'Posts' }
  | { readonly _tag: 'Post'; readonly slug: string }
  | { readonly _tag: 'NotFound'; readonly path: string };

export const pageFrom = (path: string): Page => {
  if (path === '') return { _tag: 'Opening' };
  const [first, second, ...rest] = readPath(path).segments;
  if (first === undefined) return { _tag: 'Home' };
  if (first === 'posts' && second === undefined) return { _tag: 'Posts' };
  if (first === 'posts' && second !== undefined && rest.length === 0)
    return { _tag: 'Post', slug: second };
  return { _tag: 'NotFound', path };
};

export const PersonalBlog = Actor.make('PersonalBlog', {
  requires: { location: Location },
  model: Schema.Struct({ path: Schema.String }),
  message: Schema.TaggedUnion({
    ChangedUrl: { path: Schema.String },
    ClickedLink: { path: Schema.String },
  }),
  children: { counter: Counter },
}).build({
  init: () => ({ model: { path: '' } }),
  lifetime: (self) => heardUrl(null).pipe(Stream.runForEach(self.send)),
  update: {
    ChangedUrl: ({ path }) => ({ model: { path } }),
    ClickedLink: ({ path }) => ({ command: pushUrl(path) }),
  },
});

export { HashLocation as PersonalBlogLive } from '../location/index.js';
