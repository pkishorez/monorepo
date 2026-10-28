---
'@kestack/devtools-kabuki': patch
'@kestack/web-platform': patch
---

Under `vite dev`, not `vite preview`, `app()` pipes a Kabuki Session's
socket at `/__devtools/kabuki/connect` on the site's own origin to the
DevTools Server, so one tunnel reaches the app and DevTools. Nothing else of
DevTools is reachable there: its own API reads files and runs things.
`app({ devtools })` names the server, `http://127.0.0.1:14400` by default,
or `false` for none.

`connect()` needs no `url`: it dials `/__devtools` on the page's origin, and
a whole URL still works for anywhere else. `when: 'asked'` is gone: attach
`connect` only where it should dial.
