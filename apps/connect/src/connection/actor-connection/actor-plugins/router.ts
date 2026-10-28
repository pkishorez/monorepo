import {
  createServer,
  type IncomingMessage,
  request as httpRequest,
  type ServerResponse,
  STATUS_CODES,
} from 'node:http';
import { connect, type Socket } from 'node:net';
import { Effect } from 'effect';
import { guard, HEALTH, pathOf, type Refusal, withoutKey } from './guard.js';

/*
 * The Connection's one public port, which its tunnel points at. After the
 * guard, `GET /health` answers here, and `/<plugin>/…` is passed to that
 * Plugin's socket as `/…`: a WebSocket as raw bytes, once its upgrade
 * request is written on, and any other request through an HTTP request of
 * its own. The router never reads what passes: Code and the Plugin type it
 * end to end. A Plugin not listening yet answers 503; a name that is no
 * Plugin, 404. A Plugin's `/control` is its CLI's alone, and is not passed.
 */

export interface RouterOptions {
  /** The port to listen on; 0 for any free one. */
  readonly port: number;
  /** The Connection Key. */
  readonly key: string;
  /** The origins a browser page may call from. */
  readonly origins: ReadonlyArray<string>;
  /** The socket of the Plugin `name`; null when there is no such Plugin. */
  readonly socketOf: (name: string) => string | null;
}

const HOST = '127.0.0.1';

/** `/<plugin><path>`: the Plugin's name, and the path on its socket. */
const TARGET = /^\/([a-z0-9][a-z0-9-]{0,62})(\/[^?]*)?(\?.*)?$/;

/** Where a request goes: a Plugin's socket and the path on it, or why it goes nowhere. */
const targetOf = (
  url: string | undefined,
  socketOf: RouterOptions['socketOf'],
): { readonly socket: string; readonly path: string } | Refusal => {
  const match = TARGET.exec(url ?? '');
  const path = match?.[2] ?? '/';
  if (!match || path === '/control' || path.startsWith('/control/'))
    return { status: 404, text: 'Not found' };
  const socket = socketOf(match[1]!);
  if (socket === null)
    return { status: 404, text: `This Connection runs no Plugin ${match[1]}` };
  return { socket, path: `${path}${match[3] ?? ''}` };
};

const STARTING: Refusal = {
  status: 503,
  text: 'This Plugin is starting; try again shortly',
};

const answer = (response: ServerResponse, { status, text }: Refusal) => {
  response.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
  response.end(text);
};

/** Answers on a raw socket, as an upgrade must, and closes it. */
const answerRaw = (socket: Socket, { status, text }: Refusal) => {
  const body = Buffer.from(text);
  socket.end(
    `HTTP/1.1 ${status} ${STATUS_CODES[status]}\r\n` +
      `Content-Type: text/plain; charset=utf-8\r\nContent-Length: ${body.length}\r\nConnection: close\r\n\r\n${text}`,
  );
};

/** The request's headers to pass on: its subprotocols without the key. */
const passedHeaders = (request: IncomingMessage) => {
  const headers = { ...request.headers };
  const protocols = withoutKey(headers['sec-websocket-protocol']);
  if (protocols === undefined) delete headers['sec-websocket-protocol'];
  else headers['sec-websocket-protocol'] = protocols;
  return headers;
};

/** The upgrade request's head, as the Plugin is to read it: at `path`, without the key. */
const headOf = (request: IncomingMessage, path: string) => {
  const lines = [`${request.method} ${path} HTTP/${request.httpVersion}`];
  const raw = request.rawHeaders;
  for (let at = 0; at < raw.length; at += 2) {
    const name = raw[at]!;
    if (name.toLowerCase() !== 'sec-websocket-protocol') {
      lines.push(`${name}: ${raw[at + 1]}`);
      continue;
    }
    const protocols = withoutKey(raw[at + 1]);
    if (protocols !== undefined) lines.push(`${name}: ${protocols}`);
  }
  return `${lines.join('\r\n')}\r\n\r\n`;
};

/** Passes a plain HTTP request to a Plugin's socket, and its answer back. */
const pass = (
  request: IncomingMessage,
  response: ServerResponse,
  target: { readonly socket: string; readonly path: string },
) => {
  const upstream = httpRequest(
    {
      socketPath: target.socket,
      path: target.path,
      method: request.method,
      headers: passedHeaders(request),
    },
    (answered) => {
      response.writeHead(answered.statusCode ?? 502, answered.headers);
      answered.pipe(response);
    },
  );
  upstream.on('error', () => {
    if (response.headersSent) response.destroy();
    else answer(response, STARTING);
  });
  request.pipe(upstream);
};

/** Passes a WebSocket to a Plugin's socket as raw bytes, both ways. */
const passUpgrade = (
  request: IncomingMessage,
  socket: Socket,
  head: Buffer,
  target: { readonly socket: string; readonly path: string },
  open: Set<Socket>,
) => {
  const upstream = connect({ path: target.socket });
  open.add(upstream);
  let connected = false;
  upstream.once('connect', () => {
    connected = true;
    upstream.write(headOf(request, target.path));
    if (head.length > 0) upstream.write(head);
    socket.pipe(upstream).pipe(socket);
  });
  upstream.on('error', () => {
    if (connected) socket.destroy();
    else answerRaw(socket, STARTING);
  });
  upstream.once('close', () => {
    open.delete(upstream);
    socket.destroy();
  });
  socket.on('error', () => upstream.destroy());
  socket.once('close', () => upstream.destroy());
};

/** Listens on `options.port` for as long as the Scope: the port it got. */
export const router = (options: RouterOptions) =>
  Effect.acquireRelease(
    Effect.callback<
      { readonly port: number; readonly close: () => void },
      Error
    >((resume) => {
      const allowed = guard(options.key, options.origins);
      const open = new Set<Socket>();
      const server = createServer((request, response) => {
        const refused = allowed(request);
        if (refused !== null) return answer(response, refused);
        if (pathOf(request.url) === HEALTH) {
          response.writeHead(200, { 'content-type': 'application/json' });
          return response.end('{"ok":true}');
        }
        const target = targetOf(request.url, options.socketOf);
        if ('status' in target) return answer(response, target);
        pass(request, response, target);
      });
      server.on('upgrade', (request: IncomingMessage, socket: Socket, head) => {
        open.add(socket);
        socket.once('close', () => open.delete(socket));
        const refused = allowed(request);
        if (refused !== null) return answerRaw(socket, refused);
        const target = targetOf(request.url, options.socketOf);
        if ('status' in target) return answerRaw(socket, target);
        passUpgrade(request, socket, head, target, open);
      });
      server.once('error', (error) =>
        resume(
          Effect.fail(
            new Error(
              `Could not listen on ${HOST}:${options.port}: ${error.message}`,
              { cause: error },
            ),
          ),
        ),
      );
      server.listen({ port: options.port, host: HOST }, () => {
        const address = server.address();
        const port =
          typeof address === 'object' && address !== null
            ? address.port
            : options.port;
        resume(
          Effect.succeed({
            port,
            close: () => {
              for (const socket of open) socket.destroy();
              server.closeAllConnections();
              server.close();
            },
          }),
        );
      });
    }),
    ({ close }) => Effect.sync(close),
  ).pipe(Effect.map(({ port }) => port));
