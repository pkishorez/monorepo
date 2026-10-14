import { Context, Effect, Layer } from 'effect';
import { Route } from '../../../../routing/index.ts';
import { Start } from '../../../server/index.ts';
import { Routes } from './routes.ts';

export const POSTS = [
  { slug: 'hello', title: 'Hello', body: 'Hi.' },
  {
    slug: 'evil',
    title: '</script><script>window.pwned = true</script>',
    body: '<!-- & \u2028 -->',
  },
];

/** What the Loaders Require, made per request from the Worker's env. */
export class Greeting extends Context.Service<
  Greeting,
  { readonly word: string }
>()('test/Greeting') {}

/** Each Loader's runs; a Loader can wait for another to start, which only ends if they run at once. */
export const runs: Array<string> = [];
const latches = new Map<
  string,
  { readonly opened: Promise<void>; readonly open: () => void }
>();
const latch = (name: string) => {
  let found = latches.get(name);
  if (!found) {
    let open!: () => void;
    const opened = new Promise<void>((done) => (open = done));
    latches.set(name, (found = { opened, open }));
  }
  return found;
};
const begin = (name: string) => {
  runs.push(name);
  latch(name).open();
};
const waitFor = (name: string) => Effect.promise(() => latch(name).opened);
export const reset = () => {
  runs.length = 0;
  latches.clear();
};

const viewer = (request: Request) => {
  const name = /(?:^|;\s*)user=([^;]+)/.exec(
    request.headers.get('cookie') ?? '',
  )?.[1];
  return name
    ? Effect.succeed({ name })
    : Effect.fail(Route.redirect(Routes.SignIn()));
};

/** The Loaders alone, as a test hands them its own Layer. */
export const loaders = Routes.loaders({
  Blog: () =>
    Effect.gen(function* () {
      begin('Blog');
      const { word } = yield* Greeting;
      return POSTS.map(({ slug, title }) => ({
        slug,
        title: `${word} ${title}`,
      }));
    }),
  'Blog.Post': ({ slug }) =>
    Effect.gen(function* () {
      begin(`Blog.Post:${slug}`);
      if (slug === 'moved')
        return yield* Route.redirect(Routes.Blog.Post({ slug: 'hello' }));
      const post = POSTS.find((each) => each.slug === slug);
      if (!post) return yield* Route.notFound();
      return post;
    }),
  Account: (_params, request) =>
    Effect.suspend(() => {
      begin('Account');
      // On the settings page, it waits for the settings' Loader to start.
      const settings = new URL(request.url).pathname === '/account/settings';
      return (settings ? waitFor('Account.Settings') : Effect.void).pipe(
        Effect.andThen(viewer(request)),
      );
    }),
  'Account.Settings': (_params, request) =>
    Effect.suspend(() => {
      begin('Account.Settings');
      return waitFor('Account').pipe(
        Effect.andThen(viewer(request)),
        Effect.as({ theme: 'dark' }),
      );
    }),
  'Account.Activity': () => Effect.succeed({ events: 3 }),
  Dashboard: (_params, request) =>
    Effect.sync(() => {
      begin('Dashboard');
      return { visits: new URL(request.url).pathname.length };
    }),
});

/** What the Loaders Require, made once from the Worker's env. */
export default Start.layers<{ readonly WORD?: string }>()
  .instance((env) => Layer.succeed(Greeting, { word: env.WORD ?? 'Read:' }))
  .loaders(loaders);
