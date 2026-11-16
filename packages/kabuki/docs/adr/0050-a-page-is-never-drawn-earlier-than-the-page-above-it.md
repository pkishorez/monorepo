# A page is never drawn earlier than the page above it

Any Render Mode could sit under any other. Data is loaded per place, but a URL has one first drawing, so what a URL's HTML held was worked out from every place on its path: static only if all of them were, cut off at the first client one. A static page under a dynamic one gained nothing, since its URL was drawn at the request anyway, and nobody could say from a page alone how its URL was first drawn.

Now the three modes are in order, static, dynamic, client, each later than the one before, and a page is never drawn earlier than the page above it. Static is where every app starts, so no page says it: `render` is `'dynamic'` or `'client'`, and the pages under it inherit it. The one thing left to refuse is `dynamic` under a client page, where the server draws nothing: a type error on `Router.define`, which names the page, and an error when the router is made, for a root read lazily or typed loosely. So a URL is first drawn as its deepest page says, and a static page has only static pages above it, which is what lets a build draw it.

## Considered Options

- **Any mode under any other (until now)**: rejected, as above.
- **Check each page against the pages it names, in `Page.define`**: rejected. Pages are defined from the bottom up, and a page that says no mode does not know its own until it sits under another; the router is the first place where every mode is known.
- **Keep `render: 'static'`, and refuse it under a later page**: rejected. A check for what need not be writable at all.
- **Let `dynamic` under a client page mean client**: rejected. A page that says one mode and has another is the fuzziness this removes.

## Consequences

- A static page under a dynamic or client one cannot be written. Its data could have been kept as Static Data; it is now loaded as its parent's mode says.
- A layout shared by pages of several modes has no data, or static data, and sits above them.
