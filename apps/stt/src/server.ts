import handler from '@tanstack/react-start/server-entry';
import type { WorkerEnv } from '../alchemy.run.ts';

export default {
  fetch: (request) => handler.fetch(request),
} satisfies ExportedHandler<WorkerEnv>;
