// What the build fixes for the Worker and the browser alike.
interface ImportMetaEnv {
  /** The Auth Worker's URL, or '' for Local mode. Set by `alchemy.run.ts`. */
  readonly VITE_CONSOLE_AUTH_URL?: string;
}

// The plugin's Worker, which `src/server/worker.ts` serves behind its routes.
declare module 'virtual:kabuki-start/worker' {
  const worker: {
    readonly fetch: (request: Request, env: unknown) => Promise<Response>;
  };
  export default worker;
}
