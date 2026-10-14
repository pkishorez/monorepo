# A server draws pages started from their Loaders, and never runs a Runtime

Start draws an app's first page on a server. Kabuki loads data with Commands and Workers, which only a Runtime runs, and a Runtime on a server would have to know when its work is done, which nothing in core can tell. So a server never runs one. A place that needs data before it is drawn declares its Input in the Routes, and one server function per place, its Loader, returns it. For a URL, Start runs the Loaders of every place it names at once, starts each page from its own Input with its pure init, and draws the Snapshot that makes, sending it beside the HTML as a Restore. The browser hydrates it and only then starts the Runtime. After a click, the Router asks the server for the Inputs of the places that changed, through an RPC that Start makes from the Routes, and starts those pages from the answers.

A Loader is given its params, and the request unless its place is static. It never sees its parent's Input, so no Loader waits on another and a URL is drawn once, with no streaming. Who may see a place is the Loader's to decide: it fails as not found or Redirects, and there is no middleware.

## Considered Options

- **Run a Runtime on the server until its work is done**: rejected. It needs core to count every pending Command and Worker, and a deadline for those that never end, and the page then depends on timing.
- **Draw only init, and load everything in the browser**: rejected. A post's text and its title would never reach the HTML search reads.
- **A Loader per place that runs in the browser too, through RPC clients**: rejected. Every Loader would need an RPC written for it, and a server-only Loader can read the request and anything else on the server directly.
- **The app writes its own RPC group, and a place names the endpoint it loads from**: rejected. The Routes already say every place's params and Input, so the group is made from them and cannot disagree with them.
- **Middleware per place**: rejected. A place's access is one check in its Loader, and a check several places share is a plain function.
- **A Loader given its parent's Input**: rejected. Loaders would run one after another, and a page would be drawn in pieces.

## Consequences

- A part of a page that is not a place never loads on the server: it starts from its defaults or its Props, and fetches in the browser with a Worker.
- A Loader's answer is in the Snapshot, so it is checked against the place's Input Schema and must be JSON-safe.
- Metadata that needs data is worked out from the Input, on the server, and no longer drawn by a View.
- Restarting a running app from a History fetched later, as for a signed-in user's saved app, is not part of this and is still to be built in core.
