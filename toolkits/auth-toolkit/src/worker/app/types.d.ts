import type { PagesContext } from '../../contract/index.js';

declare module '@tanstack/react-start' {
  interface Register {
    server: {
      requestContext: PagesContext;
    };
  }
}
