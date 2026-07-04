import { createFileRoute } from '@tanstack/react-router';
import { loadSourceData } from '@/lib/source';

export const Route = createFileRoute('/api/source')({
  server: {
    handlers: {
      GET: async () => Response.json(await loadSourceData()),
    },
  },
});
