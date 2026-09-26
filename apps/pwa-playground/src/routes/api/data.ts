import { createFileRoute } from '@tanstack/react-router';
import { makeData } from '../../lib/data.ts';
import { servedHeaders } from '../../lib/served.ts';

export const Route = createFileRoute('/api/data')({
  server: {
    handlers: {
      GET: () => Response.json(makeData(), { headers: servedHeaders() }),
    },
  },
});
