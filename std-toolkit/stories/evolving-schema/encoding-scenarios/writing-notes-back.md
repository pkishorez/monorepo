# Writing notes back

The ladder has a direction, and this is not it.

Every write lands at the latest version. Storage therefore only ever gains newer
notes — which is what quietly retires an old version: each note leaves it the
first time somebody saves that note.

Encode does not climb. It speaks the latest shape and nothing else, so handing
it an older shape is an error rather than an invitation to migrate. The way to
save an old-shaped note is to send it through `decode` first and encode what
comes back.
