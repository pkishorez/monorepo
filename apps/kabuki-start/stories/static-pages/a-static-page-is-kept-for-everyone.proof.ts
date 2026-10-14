import { Effect } from 'effect';
import { Proof } from 'laymos/story';

/** The site under test: `KABUKI_START_URL`, or `vp dev` on its local port. */
const SITE =
  globalThis.process?.env.KABUKI_START_URL?.replace(/\/$/, '') ??
  'http://localhost:4317';

const KEPT = 'public, max-age=0, s-maxage=31536000';
const NEVER = 'private, no-store';

/** One page's status and Cache-Control, and whether a build served it (`vp dev` says "build dev"). */
const get = (path: string, cookie?: string) =>
  Effect.promise(async () => {
    const response = await fetch(`${SITE}${path}`, {
      redirect: 'manual',
      headers: cookie ? { cookie } : {},
    });
    const html = await response.text();
    return {
      path,
      status: response.status,
      cache: response.headers.get('cache-control'),
      built: !html.includes(', build dev</span>'),
    };
  });

export default Proof.make({
  title:
    'A static page may be kept by the CDN for a year; a page for one person never is',
  description:
    'Every place drawn on the server is static: public, s-maxage a year, as the build id changes on every deploy. Any dynamic place: private, no-store. In dev nothing is kept, so every page is private, no-store there.',
  prepare: Effect.succeed({}),
  act: () =>
    Effect.all([
      get('/'),
      get('/about'),
      get('/blog/drawn-once'),
      get('/docs/loaders'),
      get('/dashboard'),
      get('/account', 'session=Grace'),
      get('/account/settings', 'session=Grace'),
      get('/shop/cart', 'cart=mug'),
    ]),
  verify: (pages) =>
    Effect.gen(function* () {
      const built = pages.every((page) => page.built);
      const statics = pages.slice(0, 5);
      const dynamics = pages.slice(5);
      for (const page of statics)
        yield* Proof.assert(
          built
            ? `${page.path}, all static on the server: ${page.cache}`
            : `${page.path}, in dev: nothing is kept (${page.cache})`,
          page.status === 200 && page.cache === (built ? KEPT : NEVER),
        );
      for (const page of dynamics)
        yield* Proof.assert(
          `${page.path}, drawn for one person: ${page.cache}`,
          page.status === 200 && page.cache === NEVER,
        );
    }),
});
