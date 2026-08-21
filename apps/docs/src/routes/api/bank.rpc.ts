import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/bank/rpc')({
  server: {
    handlers: {
      POST: ({ request, context }) => context.env.BANK_API.fetch(request),
    },
  },
});
