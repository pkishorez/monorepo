import type { Build, Script } from '../common/index.ts';
import type { Platform } from '../platform/index.ts';
import type { Files } from './files.ts';

/*
 * The modules the plugin writes, so the app writes no entry: Start's
 * handler, which knows no platform; the server's entry, which hands it to
 * the platform's adapter; the browser's; and what the server knows of the
 * build.
 */

export const HANDLER = 'virtual:kabuki-start/handler';
export const WORKER = 'virtual:kabuki-start/worker';
export const CLIENT = 'virtual:kabuki-start/client';
export const BUILD = 'virtual:kabuki-start/build';

/** The name the client entry's chunk is given, to find it in the manifest. */
export const ENTRY = 'kabuki-start';

const from = (file: string) => JSON.stringify(file.replace(/\\/g, '/'));

/** Start's handler, made from the app's two files: what every platform serves. */
export const handlerModule = (files: Files) =>
  [
    `import { server } from '@kestack/kabuki/start/server';`,
    `import app from ${from(files.app)};`,
    files.loaders
      ? `import loaders from ${from(files.loaders)};`
      : `const loaders = undefined;`,
    `import build from '${BUILD}';`,
    `export default server({ app, loaders, build });`,
  ].join('\n');

/** The server's entry: the handler in the platform's adapter, its only export. */
export const workerEntry = (platform: Platform) =>
  [
    `import { ${platform.serve.name} as serve } from ${JSON.stringify(platform.serve.from)};`,
    `import handler from '${HANDLER}';`,
    `export default serve(handler);`,
  ].join('\n');

/**
 * The browser's entry: hydrates the page the Worker drew. In dev it takes
 * itself back whenever the app changes, and draws the page again with it,
 * so an edit anywhere in the app is a hot reload, not a full one. React
 * Refresh cannot swap the app, which is a value, not a component; the app
 * carries on from its History, replayed with the new code. In dev it also
 * turns off the styles the server linked in the head, which the app's own
 * scripts have added again by then.
 */
export const clientEntry = (files: Files, devStyles?: string) =>
  [
    `import { client } from '@kestack/kabuki/start/client';`,
    `import app from ${from(files.app)};`,
    // The app's scripts have added its styles: the server's copy goes off.
    ...(devStyles
      ? [
          `for (const link of window.document.querySelectorAll('link[rel="stylesheet"][href=${JSON.stringify(devStyles)}]'))`,
          `  if (link.sheet) link.sheet.disabled = true;`,
        ]
      : []),
    `const drawn = import.meta.hot?.data.hydrated;`,
    `const hydrated = drawn`,
    `  ? drawn.then((page) => (page.redraw(app), page))`,
    `  : client(app);`,
    `if (import.meta.hot) {`,
    `  import.meta.hot.data.hydrated = hydrated;`,
    `  import.meta.hot.accept();`,
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
