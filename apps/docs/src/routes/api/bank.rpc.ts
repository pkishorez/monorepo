import { createFileRoute } from '@tanstack/react-router';
import { bankServerFetch } from '@/demos/bank/rpc/server';

export const Route = createFileRoute('/api/bank/rpc')({
  server: {
    handlers: {
      POST: ({ request }) => bankServerFetch(request),
    },
  },
});
