import { app } from './app.ts';
import { Document, Head, Scripts, useDrawn, useRuntime } from './document.tsx';
import type { DocumentProps as Props, Drawn as DrawnBy } from './document.tsx';

/*
 * Start, as `src/app` writes it, on both sides: what `@kestack/kabuki/start`
 * gives. The server's own, `Start.layers()` for `src/loaders.server`, is
 * `@kestack/kabuki/start/server`'s.
 *
 *   src/app.tsx           Start.app(router, AppView, { document, layer })
 *   src/document.tsx      <Start.Head /> in its head, <Start.Scripts /> at the end of its body
 */

/**
 * What an app writes for Start on both sides: `Start.app(…)`, the app with
 * its Document and what it needs in the browser. The parts of the Document
 * Start fills: `<Start.Head />` in its `<head>`, `<Start.Scripts />` at the
 * end of its `<body>`; `Start.Document`, the plainest one;
 * `Start.useDrawn()`, when and by which build the server drew the page; and
 * `Start.useRuntime()`, the running app, for devtools in the Document.
 */
export const Start = { app, Document, Head, Scripts, useDrawn, useRuntime };

export declare namespace Start {
  /** What the Document is drawn with: the app, as its children, to put in `<body>`. */
  export type DocumentProps = Props;
  /** What `Start.useDrawn()` gives. */
  export type Drawn = DrawnBy;
}
