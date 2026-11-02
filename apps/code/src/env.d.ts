/// <reference types="vite/client" />

/*
 * The site's `VITE_*` env, which Vite inlines. Alchemy sets the Auth
 * Worker the stage signs in through, and where Cloud Connect is. The
 * build sets `PLUGIN_CODE` and `PLUGIN_FILES`, the sha256 of the code and
 * files Plugins' Releases it calls (`scripts/plugin-release.ts`).
 */
interface ImportMetaEnv {
  readonly VITE_AUTH_URL: string;
  readonly VITE_CONNECT_URL: string;
  readonly PLUGIN_CODE: string;
  readonly PLUGIN_FILES: string;
}
