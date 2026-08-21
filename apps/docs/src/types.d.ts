import type { WorkerEnv } from '../alchemy.run';

declare global {
  interface ImportMetaEnv {
    readonly VITE_BANK_DO_URL?: string;
  }

  namespace Cloudflare {
    interface Env extends WorkerEnv {}
  }
}

declare module '@tanstack/react-start' {
  interface Register {
    server: {
      requestContext: { env: Cloudflare.Env };
    };
  }
}
