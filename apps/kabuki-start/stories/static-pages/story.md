# Static pages

A page that is the same for everyone is drawn once per deploy, then served from the cache.

A blog post or a docs page does not change between visitors, so drawing it for each one wastes time. A static place is the default Render Mode: its Loader is handed its params and nothing else, so what it returns cannot depend on who asked.

[A static page arrives as whole HTML, its Input already in it](kabuki-start/static-pages/a-static-page-arrives-drawn-with-its-input), so a crawler or a link preview reads it all. Its response says [it may be kept by the CDN for a year, while a page for one person never is](kabuki-start/static-pages/a-static-page-is-kept-for-everyone), and the Worker keeps it under the build id: [a static page is drawn once per deploy and then served from the cache](kabuki-start/static-pages/a-static-page-is-drawn-once-per-deploy). The next deploy draws it again.
