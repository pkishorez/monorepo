import { createFileRoute } from '@tanstack/react-router';
import { loadBlogData } from '@/lib/blog';

export const Route = createFileRoute('/api/blog')({
  server: {
    handlers: {
      GET: () => Response.json(loadBlogData()),
    },
  },
});
