# Kabuki Start

Serve your Kabuki app from one Cloudflare Worker, each page drawn first where it belongs: once per deploy, per request, or in the browser.

A site wants pages that arrive whole for search engines and link previews, pages drawn for the person asking, and pages that only make sense in the browser. Usually that means a framework per kind, a route table for the server, and an API for the data.

With Start you write your Routes once, a Loader for each place that needs data, and say how each place is first drawn:

```ts
Account: Route.path('/account', { render: 'dynamic', input: Viewer }, { … })
```

The plugin writes the Worker and the browser's entry. [Every first page arrives drawn and the browser takes over without an error](kabuki-start/every-first-page-hydrates-without-an-error).

[Static pages](kabuki-start/static-pages) are drawn once per deploy and cached. [Server-drawn pages](kabuki-start/server-drawn-pages) are drawn for each request, from its cookies. [Client pages](kabuki-start/client-pages) are drawn in the browser alone. A URL names several places at once, and [nested pages](kabuki-start/nested-pages) get every place's data together, whatever mix of modes.

After the first page, [moves](kabuki-start/moves) load only what changed, and Back is free. Addresses that name nothing are handled by [not found and redirects](kabuki-start/not-found-and-redirects). Each page's [metadata](kabuki-start/metadata) comes from its data, and [the Document](kabuki-start/document) puts your theme on before the first paint.
