import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { ResolverFactory } from 'oxc-resolver';
import type { Plugin, ViteDevServer } from 'vite';

import type { ProofFile } from '../load-stories.js';

export interface PageHost {
  readonly url: (id: string) => string;
  readonly close: () => Promise<void>;
}

const pagePrefix = '/__laymos/proof/';

/** One Vite dev server for a Project, serving a page per browser Proof that mounts `proof.page`. */
export async function startPageHost(
  projectRoot: string,
  files: readonly ProofFile[],
): Promise<PageHost> {
  const vite = await importVite(projectRoot);
  const server = await vite.createServer({
    root: projectRoot,
    logLevel: 'error',
    clearScreen: false,
    appType: 'custom',
    server: { host: '127.0.0.1', port: 0, hmr: false, watch: null },
    optimizeDeps: { entries: files.map(({ path }) => path) },
    plugins: [proofPages(files)],
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (
    address === null ||
    address === undefined ||
    typeof address === 'string'
  ) {
    await server.close();
    throw new Error('The Proof page host did not get a port');
  }
  const origin = `http://127.0.0.1:${address.port}`;
  return {
    url: (id) => `${origin}${pagePrefix}${encodeURIComponent(id)}`,
    close: () => server.close(),
  };
}

function proofPages(files: readonly ProofFile[]): Plugin {
  const byId = new Map(files.map((file) => [file.id, file.path]));
  return {
    name: 'laymos-proof-pages',
    configureServer(server: ViteDevServer) {
      server.middlewares.use((request, response, next) => {
        const url = request.url ?? '';
        if (!url.startsWith(pagePrefix)) return next();
        const path = byId.get(
          decodeURIComponent(url.slice(pagePrefix.length).split('?', 1)[0]!),
        );
        if (path === undefined) return next();
        server.transformIndexHtml(url, proofPage(path)).then(
          (html) => {
            response.setHeader('content-type', 'text/html');
            response.end(html);
          },
          (error: unknown) => next(error),
        );
      });
    },
  };
}

function proofPage(path: string): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module">
      import proof from ${JSON.stringify(`/@fs${path}`)};
      proof.page(document.getElementById('root'));
    </script>
  </body>
</html>`;
}

type Vite = typeof import('vite');

/** Uses the Project's own Vite, so its config and plugins apply; laymos's copy otherwise. */
async function importVite(projectRoot: string): Promise<Vite> {
  const resolver = new ResolverFactory({ conditionNames: ['node', 'import'] });
  const own = dirname(fileURLToPath(import.meta.url));
  for (const directory of [projectRoot, own]) {
    const resolved = resolver.sync(directory, 'vite');
    if (resolved.path !== undefined) {
      return (await import(pathToFileURL(resolved.path).href)) as Vite;
    }
  }
  throw new Error(
    'Browser Proofs need Vite: add `vite` to the Project’s devDependencies.',
  );
}
