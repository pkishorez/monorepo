import { createFileRoute } from '@tanstack/react-router';

const proxy = ({
  request,
  context,
}: {
  readonly request: Request;
  readonly context: { readonly env: Cloudflare.Env };
}) => {
  const auth = context.env.DURABLE_WEBRTC_AUTH;
  if (auth === undefined) return new Response(null, { status: 404 });
  const headers = new Headers(request.headers);
  const url = new URL(request.url);
  const host =
    request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  const protocol = host?.endsWith('.kishore.computer')
    ? 'https'
    : (request.headers.get('x-forwarded-proto') ?? url.protocol.slice(0, -1));
  headers.set(
    'x-durable-auth-origin',
    host === null ? url.origin : `${protocol}://${host}`,
  );
  return auth.fetch(new Request(request, { headers }));
};

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: proxy,
      POST: proxy,
      OPTIONS: proxy,
    },
  },
});
