/// <reference types="vite/client" />

/*
 * The site's `VITE_*` env, which Vite inlines. Alchemy sets the Auth
 * Worker the stage signs in through, and where Connect Cloud is. The
 * build sets `PLUGIN_CODE`, the sha256 of the code Plugin's Release it
 * calls (`scripts/plugin-code.ts`). `pnpm dev` sets `VITE_MODE` to
 * `fake`: the whole app in the tab over its Fakes (`src/fake.ts`), read
 * only while developing.
 */
interface ImportMetaEnv {
  readonly VITE_AUTH_URL: string;
  readonly VITE_CONNECT_URL: string;
  readonly PLUGIN_CODE: string;
  readonly VITE_MODE?: 'fake';
}
