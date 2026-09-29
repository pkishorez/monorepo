import type { PagesContext } from '../../auth-worker-contract/index.js';

declare module '@tanstack/react-start' {
  interface Register {
    server: {
      requestContext: PagesContext;
    };
  }
}
