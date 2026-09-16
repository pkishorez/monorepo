import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/durable-signaling')({
  server: {
    handlers: {
      GET: ({ request, context }) => {
        const headers = new Headers(request.headers);
        const url = new URL(request.url);
        const host =
          request.headers.get('x-forwarded-host') ??
          request.headers.get('host');
        const protocol = host?.endsWith('.kishore.computer')
          ? 'https'
          : (request.headers.get('x-forwarded-proto') ??
            url.protocol.slice(0, -1));
        headers.set(
          'x-durable-signaling-origin',
          host === null ? url.origin : `${protocol}://${host}`,
        );
        return context.env.DURABLE_WEBRTC_SIGNALING.fetch(
          new Request(request, { headers }),
        );
      },
    },
  },
});
