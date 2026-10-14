import { Context, Effect, Layer } from 'effect';
import { DOCS, POSTS, PRODUCTS, REPORTS, VISITS } from './data.ts';

/*
 * The pretend backend, in the Worker's memory: what a database would hold.
 * Each read is an Effect, as it would be over a network. Who the user is
 * comes from the session the Loader read: the backend trusts it.
 */

const find = <T extends { readonly [key: string]: unknown }>(
  rows: ReadonlyArray<T>,
  key: keyof T,
  value: string,
) => Effect.sync(() => rows.find((row) => row[key] === value));

/** Each read answers what a page needs, or `undefined` if there is nothing there. */
const backend = {
  posts: Effect.sync(() => ({
    posts: POSTS.map(({ slug, title, summary, date }) => ({
      slug,
      title,
      summary,
      date,
    })),
  })),
  post: (slug: string) => find(POSTS, 'slug', slug),
  docs: Effect.sync(() => ({
    pages: DOCS.map(({ slug, title }) => ({ slug, title })),
  })),
  doc: (slug: string) => find(DOCS, 'slug', slug),
  products: Effect.sync(() => ({ products: [...PRODUCTS] })),
  /** The products in a cart, with how many of each. */
  cart: (ids: ReadonlyArray<string>) =>
    Effect.sync(() => ({
      items: PRODUCTS.flatMap((product) => {
        const quantity = ids.filter((id) => id === product.id).length;
        return quantity > 0 ? [{ ...product, quantity }] : [];
      }),
    })),
  viewer: (name: string) => Effect.succeed({ name }),
  prefs: (name: string) =>
    Effect.sync(() => ({
      email: `${name.toLowerCase().replace(/\W+/g, '.')}@example.com`,
      newsletter: name.length % 2 === 0,
      language: 'English',
    })),
  activity: (name: string) =>
    Effect.sync(() => ({
      events: [
        { what: `${name} signed in`, ago: 'just now' },
        { what: 'Read “Every Loader at once”', ago: '2 days ago' },
        { what: 'Added a Route tree poster to the cart', ago: '5 days ago' },
        { what: 'Changed the newsletter setting', ago: '3 weeks ago' },
      ],
    })),
  stats: Effect.sync(() => ({
    visits: [...VISITS],
    signups: 233,
    orders: 456,
    reports: REPORTS.map(({ id, title }) => ({ id, title })),
  })),
  report: (id: string) =>
    Effect.map(find(REPORTS, 'id', id), (report) =>
      report
        ? {
            id: report.id,
            title: report.title,
            rows: report.rows.map(([label, value]) => ({ label, value })),
          }
        : undefined,
    ),
};

/** The pretend backend the Loaders read. */
export class Backend extends Context.Service<Backend, typeof backend>()(
  'kabuki-start/Backend',
) {
  /** All of it in memory. */
  static readonly memory = Layer.succeed(Backend, backend);
}
