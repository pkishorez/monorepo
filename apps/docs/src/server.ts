import handler from '@tanstack/react-start/server-entry';

export default {
  fetch: (request, env) => handler.fetch(request, { context: { env } }),
} satisfies ExportedHandler<Cloudflare.Env>;
