import type { Build, Script } from '../page/index.ts';
import type { Files } from './files.ts';

/*
 * The modules the plugin writes, so the app writes no entry: the Worker's,
 * the browser's, and what the Worker knows of the build.
 */

export const WORKER = 'virtual:kabuki-start/worker';
export const CLIENT = 'virtual:kabuki-start/client';
export const BUILD = 'virtual:kabuki-start/build';
export const DOCUMENT = 'virtual:kabuki-start/document';

/** The name the client entry's chunk is given, to find it in the manifest. */
export const ENTRY = 'kabuki-start';

const from = (file: string) => JSON.stringify(file.replace(/\\/g, '/'));

const optional = (name: string, file: string | undefined) =>
  file ? `import ${name} from ${from(file)};` : `const ${name} = undefined;`;

/** The Worker: Start's `fetch`, made from the app's files. */
export const workerEntry = (files: Files) =>
  [
    `import { server } from '@kestack/kabuki/start/server';`,
    `import app from ${from(files.app)};`,
    `import document from '${DOCUMENT}';`,
    optional('loaders', files.loaders),
    optional('layer', files.serverLayer),
    `import build from '${BUILD}';`,
    `export default server({ app, document, loaders, layer, build });`,
  ].join('\n');

/**
 * The browser's entry: hydrates the page the Worker drew. In dev it takes
 * itself back whenever the app, its Document or its Layer changes, and
 * draws the page again with them, so an edit anywhere in the app is a hot
 * reload, not a full one. React Refresh cannot swap the app, which is a
 * value, not a component; the app carries on from its History, replayed
 * with the new code. In dev it also turns off the styles the server linked
 * in the head, which the app's own scripts have added again by then.
 */
export const clientEntry = (files: Files, devStyles?: string) =>
  [
    `import { client } from '@kestack/kabuki/start/client';`,
    `import app from ${from(files.app)};`,
    `import document from '${DOCUMENT}';`,
    optional('layer', files.clientLayer),
    // The app's scripts have added its styles: the server's copy goes off.
    ...(devStyles
      ? [
          `for (const link of window.document.querySelectorAll('link[rel="stylesheet"][href=${JSON.stringify(devStyles)}]'))`,
          `  if (link.sheet) link.sheet.disabled = true;`,
        ]
      : []),
    `const drawn = import.meta.hot?.data.hydrated;`,
    `const hydrated = drawn`,
    `  ? drawn.then((page) => (page.redraw({ app, document, layer }), page))`,
    `  : client({ app, document, layer });`,
    `if (import.meta.hot) {`,
    `  import.meta.hot.data.hydrated = hydrated;`,
    `  import.meta.hot.accept();`,
    `}`,
  ].join('\n');

/** The app's Document, or, if it writes none, the plainest one: Start's parts in an English page. */
export const documentModule = (files: Files) =>
  files.document
    ? `export { default } from ${from(files.document)};`
    : [
        `import { createElement as h } from 'react';`,
        `import { Start } from '@kestack/kabuki/start';`,
        `export default function Document({ children }) {`,
        `  return h('html', { lang: 'en' }, h('head', null, h(Start.Head)), h('body', null, children, h(Start.Scripts)));`,
        `}`,
      ].join('\n');

export const buildModule = (build: Build) =>
  `export default ${JSON.stringify(build)};`;

/** The scripts Vite writes in an HTML page's head in dev: its client, and React Refresh's preamble. */
export const devScripts = (html: string): ReadonlyArray<Script> => {
  const head = /<head>([\s\S]*?)<\/head>/.exec(html)?.[1] ?? '';
  return Array.from(
    head.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g),
    ([, attributes = '', code = '']) => {
      const src = /\bsrc="([^"]*)"/.exec(attributes)?.[1];
      return src !== undefined ? { src } : { code };
    },
  );
};
