import { createHash } from 'node:crypto';
import {
  createServer,
  type IncomingMessage,
  request as httpRequest,
  type ServerResponse,
  STATUS_CODES,
} from 'node:http';
import { connect, type Socket } from 'node:net';
import { Effect } from 'effect';
import { PortFailed, type ServerOptions } from '../contract/index.js';
import {
  HEALTH,
  KEY_EXPIRED,
  KEY_HEADER,
  mismatchReason,
  PLUGIN_MISMATCH,
  pluginOfPath,
  PROTOCOL,
} from '../../../http/link/contract/index.js';
import {
  corsOf,
  EXPIRED,
  guard,
  pathOf,
  type Refusal,
  withoutKey,
} from './guard.js';
import { MOST_HELD, readFrames } from './frames.js';

const HOST = '127.0.0.1';

interface Mismatch {
  readonly running: string | null;
}

type Target =
  | { readonly socket: string; readonly path: string }
  | Refusal
  | Mismatch;

const targetOf = (url: string | undefined, options: ServerOptions): Target => {
  const path = pathOf(url) ?? '';
  const query = (url ?? '').slice(path.length);
  const release = pluginOfPath(path);
  if (release === null) return { status: 404, text: 'Not found' };
  const route = options.route(release.name, release.hash);
  if (route === null)
    return {
      status: 404,
      text: `This Connection runs no Plugin ${release.name}`,
    };
  return 'socket' in route
    ? { socket: route.socket, path: `/rpc${query}` }
    : { running: route.running };
};

const STARTING: Refusal = {
  status: 503,
  text: 'This Plugin is starting; try again shortly',
};

const answer = (
  response: ServerResponse,
  { status, text }: Refusal,
  cors: Record<string, string> = {},
) => {
  response.writeHead(status, {
    ...cors,
    'content-type': 'text/plain; charset=utf-8',
  });
  response.end(text);
};

const answerRaw = (socket: Socket, { status, text }: Refusal) => {
  const body = Buffer.from(text);
  socket.end(
    `HTTP/1.1 ${status} ${STATUS_CODES[status]}\r\n` +
      `Content-Type: text/plain; charset=utf-8\r\nContent-Length: ${body.length}\r\nConnection: close\r\n\r\n${text}`,
  );
};

const answerMismatch = (
  response: ServerResponse,
  { running }: Mismatch,
  cors: Record<string, string>,
) => {
  response.writeHead(409, { ...cors, 'content-type': 'application/json' });
  response.end(mismatchReason(running));
};

const ACCEPT = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

const CLOSE_ANSWER = 5_000;

const closeWith = (
  request: IncomingMessage,
  socket: Socket,
  code: number,
  text: string,
) => {
  const key = request.headers['sec-websocket-key'];
  if (typeof key !== 'string')
    return answerRaw(socket, { status: 400, text: 'Not a WebSocket' });
  const offered =
    withoutKey(request.headers['sec-websocket-protocol'])?.split(', ') ?? [];
  const protocol = offered.includes(PROTOCOL) ? PROTOCOL : offered[0];
  const accept = createHash('sha1')
    .update(key + ACCEPT)
    .digest('base64');
  const reason = Buffer.from(text);
  const close = Buffer.alloc(4 + reason.length);
  close[0] = 0x88;
  close[1] = 2 + reason.length;
  close.writeUInt16BE(code, 2);
  reason.copy(close, 4);
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n` +
      (protocol === undefined
        ? ''
        : `Sec-WebSocket-Protocol: ${protocol}\r\n`) +
      '\r\n',
  );
  socket.write(close);
  const cut = setTimeout(() => socket.destroy(), CLOSE_ANSWER);
  socket.once('close', () => clearTimeout(cut));
  let held: Buffer = Buffer.alloc(0);
  const reading = (chunk: Buffer) => {
    const { closed, left } = readFrames(Buffer.concat([held, chunk]));
    held = left;
    if (closed) {
      socket.off('data', reading);
      socket.resume();
      socket.end();
    } else if (held.length > MOST_HELD) socket.destroy();
  };
  socket.on('data', reading);
};

const passedHeaders = (request: IncomingMessage) => {
  const headers = { ...request.headers };
  const protocols = withoutKey(headers['sec-websocket-protocol']);
  if (protocols === undefined) delete headers['sec-websocket-protocol'];
  else headers['sec-websocket-protocol'] = protocols;
  delete headers[KEY_HEADER];
  return headers;
};

const headOf = (request: IncomingMessage, path: string) => {
  const lines = [`${request.method} ${path} HTTP/${request.httpVersion}`];
  const raw = request.rawHeaders;
  for (let at = 0; at < raw.length; at += 2) {
    const name = raw[at]!;
    if (name.toLowerCase() === KEY_HEADER) continue;
    if (name.toLowerCase() !== 'sec-websocket-protocol') {
      lines.push(`${name}: ${raw[at + 1]}`);
      continue;
    }
    const protocols = withoutKey(raw[at + 1]);
    if (protocols !== undefined) lines.push(`${name}: ${protocols}`);
  }
  return `${lines.join('\r\n')}\r\n\r\n`;
};

const pass = (
  request: IncomingMessage,
  response: ServerResponse,
  target: { readonly socket: string; readonly path: string },
  cors: Record<string, string>,
) => {
  const upstream = httpRequest(
    {
      socketPath: target.socket,
      path: target.path,
      method: request.method,
      headers: passedHeaders(request),
    },
    (answered) => {
      response.writeHead(answered.statusCode ?? 502, {
        ...answered.headers,
        ...cors,
      });
      answered.pipe(response);
    },
  );
  upstream.on('error', () => {
    if (response.headersSent) response.destroy();
    else answer(response, STARTING, cors);
  });
  request.pipe(upstream);
};

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

export const listen = (options: ServerOptions) =>
  Effect.acquireRelease(
    Effect.callback<
      { readonly port: number; readonly close: () => void },
      PortFailed
    >((resume) => {
      const allowed = guard(options.key, options.origins);
      const corsFor = corsOf(options.origins);
      const open = new Set<Socket>();
      const listener = createServer((request, response) => {
        const cors = corsFor(request.headers.origin);
        if (
          request.method === 'OPTIONS' &&
          'access-control-allow-origin' in cors
        ) {
          response.writeHead(204, cors);
          return response.end();
        }
        const refused = allowed(request);
        if (refused !== null) return answer(response, refused, cors);
        if (pathOf(request.url) === HEALTH) {
          response.writeHead(200, { 'content-type': 'application/json' });
          return response.end('{"ok":true}');
        }
        const target = targetOf(request.url, options);
        if ('status' in target) return answer(response, target, cors);
        if ('running' in target) return answerMismatch(response, target, cors);
        pass(request, response, target, cors);
      });
      listener.on(
        'upgrade',
        (request: IncomingMessage, socket: Socket, head) => {
          open.add(socket);
          socket.once('close', () => open.delete(socket));
          socket.on('error', () => socket.destroy());
          const refused = allowed(request);
          if (refused === EXPIRED)
            return closeWith(request, socket, KEY_EXPIRED, 'key expired');
          if (refused !== null) return answerRaw(socket, refused);
          const target = targetOf(request.url, options);
          if ('status' in target) return answerRaw(socket, target);
          if ('running' in target)
            return closeWith(
              request,
              socket,
              PLUGIN_MISMATCH,
              mismatchReason(target.running),
            );
          passUpgrade(request, socket, head, target, open);
        },
      );
      listener.once('error', (error) =>
        resume(
          Effect.fail(
            new PortFailed({
              message: `Could not listen on ${HOST}:${options.port}: ${error.message}`,
            }),
          ),
        ),
      );
      listener.listen({ port: options.port, host: HOST }, () => {
        const address = listener.address();
        const port =
          typeof address === 'object' && address !== null
            ? address.port
            : options.port;
        resume(
          Effect.succeed({
            port,
            close: () => {
              for (const socket of open) socket.destroy();
              listener.closeAllConnections();
              listener.close();
            },
          }),
        );
      });
    }),
    ({ close }) => Effect.sync(close),
  ).pipe(Effect.map(({ port }) => port));
