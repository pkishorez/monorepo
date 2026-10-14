import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';

/*
 * `vite dev` without the Cloudflare plugin: the Worker's `fetch` run in
 * Vite's own server environment, in Node, each request handed to it and
 * its response written back. Under Alchemy the Cloudflare plugin runs the
 * Worker in workerd instead, and this stands aside.
 */

export interface Fetching {
  readonly fetch: (
    request: Request,
    env: unknown,
    context: { readonly waitUntil: (promise: Promise<unknown>) => void },
  ) => Promise<Response>;
}

const toRequest = (incoming: IncomingMessage): Request => {
  const host = incoming.headers.host ?? 'localhost';
  const url = new URL(incoming.url ?? '/', `http://${host}`);
  const headers = new Headers();
  for (const [name, value] of Object.entries(incoming.headers)) {
    if (value === undefined || name.startsWith(':')) continue;
    for (const each of Array.isArray(value) ? value : [value])
      headers.append(name, each);
  }
  const hasBody = incoming.method !== 'GET' && incoming.method !== 'HEAD';
  return new Request(url, {
    method: incoming.method ?? 'GET',
    headers,
    ...(hasBody
      ? {
          body: Readable.toWeb(incoming) as ReadableStream,
          duplex: 'half',
        }
      : {}),
  } as RequestInit);
};

const send = async (response: Response, outgoing: ServerResponse) => {
  outgoing.statusCode = response.status;
  for (const [name, value] of response.headers)
    if (name !== 'set-cookie') outgoing.setHeader(name, value);
  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) outgoing.setHeader('set-cookie', cookies);
  if (!response.body) return void outgoing.end();
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>)
    outgoing.write(chunk);
  outgoing.end();
};

/** A Connect middleware that answers every request it is handed with the Worker. */
export const serveWorker =
  (load: () => Promise<Fetching>, onError: (error: Error) => void) =>
  async (
    incoming: IncomingMessage,
    outgoing: ServerResponse,
    next: (error?: unknown) => void,
  ) => {
    try {
      const worker = await load();
      await send(
        await worker.fetch(toRequest(incoming), {}, { waitUntil: () => {} }),
        outgoing,
      );
    } catch (error) {
      if (error instanceof Error) onError(error);
      next(error);
    }
  };
