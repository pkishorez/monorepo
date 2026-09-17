import type { WorkerEnv } from '../alchemy.run';

declare global {
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
