import handler from '@tanstack/react-start/server-entry';
import type { WorkerEnv } from '../infra/website.ts';

// The Worker entry is the composition point for every server-side host.
// Each primitive claims a pathname and adds a `case`; everything else is
// TanStack Start. `env` carries the bindings declared in infra/website.ts.
// Durable Object classes hosted by this Worker are re-exported from here.
export default {
  fetch: (request, _env) => {
    switch (new URL(request.url).pathname) {
      default:
        return handler.fetch(request);
    }
  },
} satisfies ExportedHandler<WorkerEnv>;
