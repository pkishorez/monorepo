# A static page is drawn at the build, from the paths it lists

Amends [ADR 0030](0030-a-server-draws-pages-started-from-their-loaders.md) and [ADR 0033](0033-start-knows-no-platform.md) for static places. A static page was the same for everyone until the next deploy, and yet nothing was drawn before a request: the server drew it the first time it was asked and kept it in the platform's Cache, per data center, and every move to it in the browser ran its Loader again, since the Loader RPC is a `POST` nothing keeps. So "static" meant two things, and what is the same for everyone was the least kept.

Now a static place's data is known at the build, and only there. A static place whose own path names params lists its Paths beside its Loader, `{ paths, load }`, each with every path param down to it, and one with no data lists them alone, `{ paths }`; a place with none of its own is wherever the page above it is. The build runs each static Loader once per listed path, with the Loaders' layer made from the build's env, keeps its answer as the Static Data, one JSON file per place and path under the build id, and draws the HTML of every URL that ends at a static place at that URL. The platform answers both as files, so a static page never reaches the server. A listed path that does not load fails the build, and a path not listed is not found.

After the build nothing runs a static Loader: the browser reads a static place's answer with a `GET` of its file, and the server, drawing a dynamic or client page under a static one, reads the same file through the platform's `files`. A page and the data a move loads later therefore cannot disagree, and a file under a build id never changes, so a CDN, a service worker and the browser may keep it for good. A static Loader is handed its path params and never its query: a query cannot be listed, and the place is the same whatever it is.

The pages are drawn by one more module the Vite plugin builds for Node and runs once the client is built, so a build needs what the app's modules need to load. In dev, and on a platform that hands the server no files, a static Loader runs when asked, as before.

## Considered Options

- **Keep drawing a static page on its first request (until now)**: rejected. Nothing can keep a page that does not exist yet, a move still ran the Loader, and an app could not say which URLs exist.
- **Start as a build alone, with no server**: rejected. A dynamic page needs one, a URL that names no page should be a `404`, and a client place's Loader stays a server function behind the Loader RPC, so every place loads the same way.
- **One list of Routes for the whole app, `prerender: () => [router.Blog.Post({ slug })]`**: rejected. Nothing could tell a forgotten page from one that has no paths; per place, a static place with params and no `paths` is a type error.
- **Read the paths from the params' Schema when it is a union of literals**: rejected. Two ways to say one thing, and most params are not literals.
- **Run the static Loader again for a request, and only write the HTML at the build**: rejected. The page and its data could disagree, the Loader would need to run in two places, the build and the Worker, and its answer could not be kept.
- **Run the built Worker in Node to draw the pages**: rejected. A Worker's module exports only its handlers, so drawing would be a hidden address on the deployed server, and a Worker's build resolves its dependencies in their edge form.
- **Draw a path the build did not list when it is first asked for**: left for later. It needs the server to write what it draws where the platform serves files.

## Consequences

- A build fails if the app's modules fail as they load, since it runs them: what only a deploy or a browser has is read when a Layer is built.
- A static Loader's data must be reachable from the build. A Worker's bindings are not there.
- A static place's Loader cannot Redirect a path it lists, and a static page's query reaches only the page, as Props. A static page whose URL needs a query fails the build.
- A URL that is all static and reaches the server, where the platform hands it the build's files, is not listed: a `404`, even for a place that lists paths and has no data.
- Each build's Static Data is its own: a tab from the build before asks for files that are gone, gets a `410`, and loads through the Loader RPC from then on.
- The build also writes what is the same for everyone and has no data of its own to load: each client page under static ones whose URL it knows, drawn loading, and the App Shell. The server's Cache keeps only what the build cannot write: a client page whose path names params, and the App Shell on a platform that hands the server no files.
- Where the files are served is the platform's: its adapter tells its host that the Static Data never changes, as lines in Cloudflare's `_headers`, and reads it back from the Worker's assets. Nitro off Cloudflare hands the server no files yet.
