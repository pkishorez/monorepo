/// <reference types="vite/client" />

/*
 * The site's `VITE_*` env, which Vite inlines. Alchemy sets the Auth
 * Worker the stage signs in through, and where Cloud Connect is.
 */
interface ImportMetaEnv {
  readonly VITE_AUTH_URL: string;
  readonly VITE_CONNECT_URL: string;
}
