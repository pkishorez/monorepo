import { createFileRoute } from '@tanstack/react-router';
import { servedHeaders } from '../../../lib/served.ts';

// One endpoint per Runtime Cache strategy (rules in src/lib/runtime-cache-rules.ts).
export const Route = createFileRoute('/api/time/$strategy')({
  server: {
    handlers: {
      GET: ({ params }) => {
        const headers = servedHeaders();
        return Response.json(
          { strategy: params.strategy, now: new Date().toISOString() },
          { headers },
        );
      },
    },
  },
});
