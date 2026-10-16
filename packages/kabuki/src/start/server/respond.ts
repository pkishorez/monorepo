/*
 * The responses Start sends besides a drawn page's own, and how long each
 * may be kept.
 */

/*
 * Every page is `no-transform`: the browser hydrates the whole Document, so
 * it must get it as drawn. Edge rewriting, as Cloudflare's injected Web
 * Analytics beacon, email obfuscation or Rocket Loader, would change it.
 */

/** A page every server-drawn place of which is static: the same for everyone until the next deploy. */
export const SHARED = 'public, max-age=0, s-maxage=31536000, no-transform';
/** A page drawn for this request alone. */
export const PRIVATE = 'private, no-store, no-transform';

export const html = (body: string, status: number, cache: string) =>
  new Response(body, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': cache,
    },
  });

/** A URL that is not written as its Route is, a redirect in the Routes, or a Loader's permanent Redirect: for good. */
export const permanent = (location: string) =>
  new Response(null, { status: 308, headers: { location } });

/** A Loader's Redirect: it depends on the request, so it is neither permanent nor kept. */
export const found = (location: string) =>
  new Response(null, {
    status: 302,
    headers: { location, 'cache-control': PRIVATE },
  });

export const notAllowed = () =>
  new Response(null, { status: 405, headers: { allow: 'GET, HEAD' } });

/** What a page that could not be drawn answers: nothing about why, which is logged. */
export const broken = () =>
  html(
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Something went wrong</title></head><body><h1>Something went wrong</h1><p>This page could not be drawn. Try again in a moment.</p></body></html>',
    500,
    PRIVATE,
  );

/** The answer to a `HEAD`: a `GET`'s, without its body. */
export const headOf = (response: Response) =>
  new Response(null, {
    status: response.status,
    headers: response.headers,
  });
