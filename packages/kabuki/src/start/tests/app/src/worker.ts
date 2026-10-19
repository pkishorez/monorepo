// A Worker that exports more than Start's handler, as one hosting a Durable
// Object does: its default export is the plugin's Worker, and `/extra` is
// its own.
import start from 'virtual:kabuki-start/worker';

export class Extra {
  readonly kind = 'extra';
}

export default {
  fetch: (request: Request, env: unknown): Promise<Response> =>
    new URL(request.url).pathname === '/extra'
      ? Promise.resolve(new Response(new Extra().kind))
      : start.fetch(request, env),
};
