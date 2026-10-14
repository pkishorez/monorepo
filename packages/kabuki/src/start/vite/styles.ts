import type { IncomingMessage, ServerResponse } from 'node:http';
import type { EnvironmentModuleNode, ViteDevServer } from 'vite';

/*
 * The app's styles in dev, before its scripts. Vite serves a stylesheet as
 * a module that adds it to the page when it runs, so a page the server drew
 * is painted bare until the browser has loaded the app's scripts. The head
 * links one stylesheet, which imports every stylesheet the app imported
 * while the server drew it, as plain CSS; the browser waits for them before
 * the first paint. Once the app's scripts have added their own, the client
 * entry turns it off, so an edit is drawn by Vite's styles alone.
 */

/** Where the stylesheet is served, after Vite's `base`. */
export const DEV_STYLES = '@kabuki-start/styles.css';

const CSS = /\.(css|less|sass|scss|styl|stylus|pcss|postcss|sss)(?:$|\?)/;
const NOT_A_STYLESHEET = /[?&](?:inline|url|raw|worker|sharedworker)\b/;

/** Every stylesheet imported, at any depth, by the modules of `files`, in the order they are imported. */
const stylesOf = (
  graph: {
    readonly getModulesByFile: (
      file: string,
    ) => Set<EnvironmentModuleNode> | undefined;
  },
  files: ReadonlyArray<string>,
): ReadonlyArray<string> => {
  const styles: Array<string> = [];
  const seen = new Set<EnvironmentModuleNode>();
  const walk = (module: EnvironmentModuleNode) => {
    if (seen.has(module)) return;
    seen.add(module);
    if (CSS.test(module.url)) {
      // A stylesheet's own imports are already in it, once Vite has served it.
      if (!NOT_A_STYLESHEET.test(module.url)) styles.push(module.url);
      return;
    }
    for (const imported of module.importedModules) walk(imported);
  };
  for (const file of files)
    for (const module of graph.getModulesByFile(file) ?? []) walk(module);
  return styles;
};

/** The stylesheet the head links in dev: an `@import` of each of the app's, from the server's drawing, else the browser's. */
export const serveStyles =
  (server: ViteDevServer, files: () => ReadonlyArray<string>) =>
  (incoming: IncomingMessage, outgoing: ServerResponse, next: () => void) => {
    const base = server.config.base;
    if (incoming.url?.split('?')[0] !== `${base}${DEV_STYLES}`) return next();
    const environments = Object.values(server.environments);
    const drawn = environments
      .filter((environment) => environment.name !== 'client')
      .flatMap((environment) => stylesOf(environment.moduleGraph, files()));
    const styles = [
      ...new Set(
        drawn.length > 0
          ? drawn
          : stylesOf(server.environments.client!.moduleGraph, files()),
      ),
    ];
    outgoing.setHeader('content-type', 'text/css');
    outgoing.setHeader('cache-control', 'no-store');
    outgoing.end(
      styles
        .map((url) => {
          const href = `${base}${url.replace(/^\//, '')}${url.includes('?') ? '&' : '?'}direct`;
          return `@import url(${JSON.stringify(href)});`;
        })
        .join('\n'),
    );
  };
