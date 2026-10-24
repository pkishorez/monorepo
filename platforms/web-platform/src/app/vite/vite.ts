import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { start } from '@kestack/kabuki/start/vite';
import type { Plugin } from 'vite';
import { noPwa, pwa } from '../../pwa/engine/vite/index.ts';

/*
 * A kstack app's Vite plugins, as one:
 *
 * 1. Look    Tailwind, which the Theme's CSS is written in, and React.
 * 2. Serve   Kabuki Start, with the app's own files and platform.
 * 3. PWA     installable, and each page offline as its Render Mode says;
 *            `pwa: false` makes it none, and the Document draws none of it.
 * 4. Server  the Web Platform bundled for the server too, its components
 *            being ESM with CSS-only side effects; and `debug`'s browser
 *            build, as workerd throws on its Node one.
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

/** Every Vite plugin a kstack app needs: `plugins: [app({ name, platform: cloudflare() })]`. */
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
  plugins.push(server);
  return plugins.flat() as Plugin[];
};
