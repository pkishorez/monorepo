import type { PagesContext } from './server.js';

declare module '@tanstack/react-start' {
  interface Register {
    server: {
      requestContext: PagesContext;
    };
  }
}
