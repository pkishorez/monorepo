import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import type { Handler } from '../platform/index.ts';

/*
 * `vite dev` with nothing else to run the server: Start's handler, which
 * knows no platform, run in Vite's own server environment, in Node, each
 * request handed to it with an empty env and no Cache, and its response
 * written back. Where a platform's own plugin runs the server, as the
 * Cloudflare plugin under `alchemy dev` runs workerd, this stands aside.
 */

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
export const serveHandler =
  (load: () => Promise<Handler>, onError: (error: Error) => void) =>
  async (
    incoming: IncomingMessage,
    outgoing: ServerResponse,
    next: (error?: unknown) => void,
  ) => {
    try {
      const handler = await load();
      await send(
        await handler.fetch(toRequest(incoming), { env: {} }),
        outgoing,
      );
    } catch (error) {
      if (error instanceof Error) onError(error);
      next(error);
    }
  };
