import type { IncomingMessage } from 'node:http';
import { isIP, connect as netConnect } from 'node:net';
import type { Duplex } from 'node:stream';
import { connect as tlsConnect } from 'node:tls';
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
 * 6. DevTools under `vite dev`, the one socket a Kabuki Session dials,
 *            `/__devtools/kabuki/connect` on the site's own origin, piped
 *            to the DevTools Server, so the same tunnel reaches it too;
 *            nothing else of DevTools is reachable there. `devtools: false`
 *            for none.
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
  /** The DevTools Server a Kabuki Session reaches at `/__devtools/kabuki/connect` under `vite dev`, `http://127.0.0.1:14400` by default; `false` for none. */
  readonly devtools?: string | false;
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

/** Where a Kabuki Session dials DevTools by default: `DEVTOOLS_PATH` in `@kestack/devtools-kabuki/session`. */
const DEVTOOLS_PATH = '/__devtools';

/**
 * The one DevTools route reachable on the site: where a Kabuki Session
 * dials, `CONNECT_PATH` in `@kestack/devtools-kabuki/api`. DevTools' own
 * API reads files and runs things, and a tunnel is public.
 */
const CONNECT_PATH = '/kabuki/connect';

/** The path under the DevTools Server an upgrade asks for, query kept, or `null` when it is not a Kabuki Session dialing. */
const connectOf = (url: string | undefined) => {
  const prefix = `${DEVTOOLS_PATH}${CONNECT_PATH}`;
  if (url === undefined || !url.startsWith(prefix)) return null;
  const rest = url.slice(prefix.length);
  return rest === '' || rest.startsWith('?') ? `${CONNECT_PATH}${rest}` : null;
};

/**
 * A Kabuki Session's socket, piped to the DevTools Server at `target` as
 * it is: under the target's own path, its Host the target's.
 */
const pipeUpgrade = (
  target: URL,
  path: string,
  request: IncomingMessage,
  socket: Duplex,
  head: Buffer,
) => {
  const secure = target.protocol === 'https:' || target.protocol === 'wss:';
  const port = Number(target.port) || (secure ? 443 : 80);
  // An IPv6 literal is bracketed in a URL, bare to connect to.
  const host = target.hostname.replace(/^\[(.*)\]$/, '$1');
  const upstream = secure
    ? tlsConnect({
        host,
        port,
        ...(isIP(host) === 0 ? { servername: host } : {}),
      })
    : netConnect({ host, port });
  const lines = [`GET ${target.pathname.replace(/\/$/, '')}${path} HTTP/1.1`];
  for (let i = 0; i < request.rawHeaders.length; i += 2) {
    const key = request.rawHeaders[i]!;
    lines.push(
      `${key}: ${key.toLowerCase() === 'host' ? target.host : request.rawHeaders[i + 1]}`,
    );
  }
  upstream.once(secure ? 'secureConnect' : 'connect', () => {
    upstream.write(`${lines.join('\r\n')}\r\n\r\n`);
    if (head.length > 0) upstream.write(head);
    upstream.pipe(socket);
    socket.pipe(upstream);
  });
  const close = () => {
    upstream.destroy();
    socket.destroy();
  };
  upstream.on('error', close);
  socket.on('error', close);
  upstream.on('close', close);
  socket.on('close', close);
};

/**
 * Under `vite dev`, not `vite preview`: a Kabuki Session's socket at
 * `/__devtools/kabuki/connect`, piped to the DevTools Server at `target`.
 * It is kept from every other upgrade listener, as the app's own (its
 * Worker's) would answer it too and write its 404 page into the socket.
 */
const devtools = (target: string): Plugin => ({
  name: '@kestack/web-platform:devtools',
  apply: (_config, { command, isPreview }) => command === 'serve' && !isPreview,
  configureServer: (viteServer) => {
    const http = viteServer.httpServer;
    if (!http) return;
    const to = new URL(target);
    const emit = http.emit.bind(http) as (
      event: string,
      ...args: Array<unknown>
    ) => boolean;
    http.emit = ((event: string, ...args: Array<unknown>) => {
      const [request, socket, head] = args as [IncomingMessage, Duplex, Buffer];
      const path = event === 'upgrade' ? connectOf(request.url) : null;
      if (path === null) return emit(event, ...args);
      pipeUpgrade(to, path, request, socket, head);
      return true;
    }) as typeof http.emit;
  },
});

/** Fails a build that carries auth-toolkit's Fake. */
const noFake: Plugin = { ...(noFakeAuth() as Plugin), apply: 'build' };

/** Every Vite plugin a kestack app needs: `plugins: [app({ name, platform: cloudflare() })]`. */
export const app = ({
  name,
  pwa: pwaOptions = {},
  react: reactOptions,
  devtools: devtoolsTarget = 'http://127.0.0.1:14400',
  ...startOptions
}: AppOptions): Plugin[] => {
  // Each package may type its plugins with its own copy of Vite's types.
  const plugins: Array<unknown> = [];
  plugins.push(tailwindcss(), react(reactOptions), start(startOptions));
  plugins.push(pwaOptions === false ? noPwa() : pwa({ ...pwaOptions, name }));
  plugins.push(server, devAuth, noFake);
  if (devtoolsTarget !== false) plugins.push(devtools(devtoolsTarget));
  return plugins.flat() as Plugin[];
};
