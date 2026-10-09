# SSG

Status: skipped. No route, no code: Effect Oak runs only in the browser, and
every demo route is `ssr: false`.

## What Foldkit's example does

Two pages, Home and About, with a counter and routing. At build time the
Foldkit Vite plugin calls the server entry's `renderPage` for each path in
`prerenderPaths` (`/` and `/about`). `Server.renderToString` runs the routing
`init` with the request's URL and the `view`, and writes static HTML per
path. In the browser, `Runtime.hydrate` starts the app from the URL and takes
over the prerendered DOM; links then navigate on the client. It has no tests
of its own.

## Why it does not fit here

- Demo routes are `ssr: false`, and Effect Oak starts its Runtime only after
  mounting in a browser, so there is no HTML to prerender.
- `init` cannot take the URL (blockers 3 and 15), so a prerender of `/about`
  and the browser's start would not even agree on the page: the first page is
  a Message after Time 0.

## What Effect Oak would need for SSG

Everything SSR needs ([ssr](../ssr/notes.md)): init with input, drawing the
root View from the init tree with no Runtime, a serializable tree, and
resuming the Runtime from it for hydration. On top of that:

- **The URL as init's input** (blocker 15): `init({ url })`, so each
  prerendered path draws its own page and the browser resumes on the same
  one.
- **Nothing per request**: a prerender has no cookies or session, so any
  per-user data must arrive after hydration, through a Lifetime of the
  resumed Runtime.

The roll-up lists this as blocker 20.
