import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { start } from '@kestack/kabuki/start/vite';
import { defaultClientConditions, type Plugin, type ProxyOptions } from 'vite';
import {
  backendsOf,
  FAKE_AUTH,
  isFakeAuth,
  noFakeAuth,
} from '../dev-auth/index.ts';
import { noPwa, pwa } from '../../pwa/engine/vite/index.ts';

/*
 * A kestack app's Vite plugins, as one:
 *
 * 1. Look    Tailwind, which the Theme's CSS is written in, and React.
 * 2. Serve   Kabuki Start, with the app's own files and platform.
 * 3. PWA     installable, and each page offline as its Render Mode says;
 *            `pwa: false` makes it none, and the Document draws none of it.
 * 4. Server  the Web Platform bundled for the server too, its components
 *            being ESM with CSS-only side effects; and `debug`'s browser
 *            build, as workerd throws on its Node one.
 * 5. Auth    under `vite dev`, auth-toolkit's Fake in the browser and every
 *            backend on the site's own origin, so one tunnel reaches it
 *            all; a build that carries the Fake fails.
 *
 * An app that wires its own still has `start()` and `pwa()`.
 */

type StartOptions = Parameters<typeof start>[0];
type PwaOptions = Parameters<typeof pwa>[0];

export interface AppOptions extends StartOptions {
  /** The app's name, as the manifest and the Install Prompt give it. */
  readonly name: string;
  /** The rest of the PWA's options, or `false` for no PWA. */
  readonly pwa?: Omit<PwaOptions, 'name'> | false;
  /** React's plugin's options, such as `include` for MDX. */
  readonly react?: Parameters<typeof react>[0];
}

const server: Plugin = {
  name: '@kestack/web-platform:app',
  config: () => ({
    ssr: { noExternal: ['@kestack/web-platform'] },
    resolve: { alias: { debug: 'debug/src/browser.js' } },
  }),
};

// A proxied request is the page's own, whatever origin it came from.
const sameOrigin = (target: string, path: string): ProxyOptions => ({
  target,
  changeOrigin: true,
  secure: false,
  ws: true,
  rewrite: (url) => url.slice(path.length) || '/',
  configure: (proxy) => {
    proxy.on('proxyReq', (request) => request.removeHeader('origin'));
    proxy.on('proxyReqWs', (request) => request.removeHeader('origin'));
  },
});

/**
 * Under `vite dev`, unless `KESTACK_AUTH=real`: the browser resolves
 * auth-toolkit's doors to its Fake, every backend `define` names (each
 * `VITE_<NAME>_URL` but auth's) is served at `/rpc-<name>` on the site's
 * origin, and a Cloudflare tunnel's host is let in.
 */
const devAuth: Plugin = {
  name: '@kestack/web-platform:dev-auth',
  apply: (_config, { command }) => isFakeAuth(command === 'serve'),
  config: (config) => {
    const backends = backendsOf(config.define ?? {});
    const hosts = config.server?.allowedHosts;
    return {
      define: Object.fromEntries(
        backends.map(({ key, path }) => [key, JSON.stringify(path)]),
      ),
      server: {
        ...(hosts === true ? {} : { allowedHosts: ['.trycloudflare.com'] }),
        proxy: Object.fromEntries(
          backends.map(({ path, target }) => [
            `^${path}(/|$)`,
            sameOrigin(target, path),
          ]),
        ),
      },
    };
  },
  configEnvironment: (name, config) => {
    if (name !== 'client') return;
    config.resolve ??= {};
    config.resolve.conditions = [
      ...(config.resolve.conditions ?? defaultClientConditions),
      FAKE_AUTH,
    ];
  },
};

/** Fails a build that carries auth-toolkit's Fake. */
const noFake: Plugin = { ...(noFakeAuth() as Plugin), apply: 'build' };

/** Every Vite plugin a kestack app needs: `plugins: [app({ name, platform: cloudflare() })]`. */
export const app = ({
  name,
  pwa: pwaOptions = {},
  react: reactOptions,
  ...startOptions
}: AppOptions): Plugin[] => {
  // Each package may type its plugins with its own copy of Vite's types.
  const plugins: Array<unknown> = [];
  plugins.push(tailwindcss(), react(reactOptions), start(startOptions));
  plugins.push(pwaOptions === false ? noPwa() : pwa({ ...pwaOptions, name }));
  plugins.push(server, devAuth, noFake);
  return plugins.flat() as Plugin[];
};
