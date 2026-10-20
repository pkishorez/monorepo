/// <reference types="vite/client" />

/* The site's `VITE_*` env, which Alchemy sets and Vite inlines: where the Auth Worker and each API Worker are. */
interface ImportMetaEnv {
  readonly VITE_AUTH_URL: string;
  readonly VITE_HELLO_HTTP_URL: string;
  readonly VITE_HELLO_RPC_URL: string;
}
