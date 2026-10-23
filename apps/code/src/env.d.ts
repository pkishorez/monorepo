/// <reference types="vite/client" />

/*
 * The site's `VITE_*` env, which Vite inlines. Alchemy sets how the stage
 * signs in (the Auth Worker's URL, or `VITE_AUTH_LOCAL=true` in Local mode
 * under `pnpm dev:local`) and where the Machines Backend is.
 */
interface ImportMetaEnv {
  readonly VITE_AUTH_URL?: string;
  readonly VITE_AUTH_LOCAL?: 'true';
  readonly VITE_MACHINES_URL: string;
}
