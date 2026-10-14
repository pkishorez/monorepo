# Not found and redirects

An address that names nothing gets a real 404, and an old one moves to the page it means.

Links rot and people mistype. You write old addresses once, as a `redirect` in the Routes, and a Loader says `Route.notFound()` when its data is not there.

[A missing page is a 404 that search engines are told to skip](kabuki-start/not-found-and-redirects/a-missing-page-is-a-404-kept-out-of-search). [An old or misspelled address moves for good to the page it means](kabuki-start/not-found-and-redirects/old-and-misspelled-addresses-move-for-good). After the first page the browser asks the same Loaders through one endpoint, and [the Loader endpoint answers Loaded, NotFound or Redirect](kabuki-start/not-found-and-redirects/the-loader-endpoint-answers-for-every-case), so [a click to a missing page or a private one lands somewhere sensible](kabuki-start/not-found-and-redirects/a-click-to-a-missing-or-private-page-lands-safely).
