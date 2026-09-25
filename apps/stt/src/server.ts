import handler from '@tanstack/react-start/server-entry';
import type { WorkerEnv } from '../alchemy.run.ts';

/** Cross-origin isolation lets the CPU speech model run on several threads. */
const isolate = (response: Response): Response => {
  const isolated = new Response(response.body, response);
  isolated.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  isolated.headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
  return isolated;
};

export default {
  fetch: async (request) => isolate(await handler.fetch(request)),
} satisfies ExportedHandler<WorkerEnv>;
