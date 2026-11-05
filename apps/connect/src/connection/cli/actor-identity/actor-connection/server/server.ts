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
import {
  KEY_EXPIRED,
  mismatchReason,
  PLUGIN_MISMATCH,
  pluginOfPath,
} from '../../../../../contract/index.js';
import {
  EXPIRED,
  guard,
  HEALTH,
  pathOf,
  type Refusal,
  withoutKey,
} from './guard.js';
import { MOST_HELD, readFrames } from './frames.js';

/*
 * The Connection's one public port, which its tunnel points at. After the
 * guard, `GET /health` answers here, and `/<plugin>/<sha256>/rpc` is passed
 * to that Plugin's socket as `/rpc` when the Plugin runs that Release: a
 * WebSocket as raw bytes, once its upgrade request is written on, and any
 * other request through an HTTP request of its own. A Release it does not
 * run is refused with what it runs: a WebSocket is taken and closed at
 * once with 4409, its reason saying so, since a browser reads nothing else
 * of it; any other request answers 409 with the same JSON. The server
 * never reads what passes: Code and the Plugin type it end to end. A
 * Plugin not listening yet answers 503; a name that is no Plugin, and any
 * other path, 404.
 *
 * A key that has expired is told the same way: a WebSocket is taken and closed
 * at once with 4401, and any other request answers 401. The key is checked
 * only as a socket connects, so one already open stays open when it changes.
 */

export interface ServerOptions {
  /** The port to listen on; 0 for any free one. */
  readonly port: number;
  /** The Connection Key now; read on each request, so a new one needs no restart. */
  readonly key: () => string;
  /** The origins a browser page may call from. */
  readonly origins: ReadonlyArray<string>;
  /** The socket of the Plugin `name`; null when there is no such Plugin. */
  readonly socketOf: (name: string) => string | null;
  /** The Release the Plugin `name` runs instead of `hash`, null while it runs none; undefined when it serves `hash`. */
  readonly otherThan: (name: string, hash: string) => string | null | undefined;
}

const HOST = '127.0.0.1';

/** A request for a Release the Plugin does not run: the one it runs, null when none. */
interface Mismatch {
  readonly running: string | null;
}

type Target =
  | { readonly socket: string; readonly path: string }
  | Refusal
  | Mismatch;

/** Where a request goes: a Plugin's socket and the path on it, or why it goes nowhere. */
const targetOf = (url: string | undefined, options: ServerOptions): Target => {
  const path = pathOf(url) ?? '';
  const query = (url ?? '').slice(path.length);
  const release = pluginOfPath(path);
  if (release === null) return { status: 404, text: 'Not found' };
  const socket = options.socketOf(release.name);
  if (socket === null)
    return {
      status: 404,
      text: `This Connection runs no Plugin ${release.name}`,
    };
  const running = options.otherThan(release.name, release.hash);
  return running === undefined ? { socket, path: `/rpc${query}` } : { running };
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

/** Answers a plain request for a Release the Plugin does not run: 409, saying which it runs. */
const answerMismatch = (response: ServerResponse, { running }: Mismatch) => {
  response.writeHead(409, { 'content-type': 'application/json' });
  response.end(mismatchReason(running));
};

/** What every WebSocket server adds to a key it accepts (RFC 6455). */
const ACCEPT = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

/** How long a socket told to close has before it is cut, whatever it sends, in ms. */
const CLOSE_ANSWER = 5_000;

/**
 * Takes a WebSocket and closes it at once with `code` and `text`, since a
 * browser cannot read the status of one refused. It selects `ke-connect`, as a
 * Plugin does, never the key: a browser drops a socket that selects none of
 * what it offered. It waits for the caller's own close before it ends the
 * socket: a tunnel between them loses a close followed straight away by the
 * end, and the caller reads only 1006.
 */
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
  const protocol = offered.includes('ke-connect') ? 'ke-connect' : offered[0];
  const accept = createHash('sha1')
    .update(key + ACCEPT)
    .digest('base64');
  const reason = Buffer.from(text);
  const close = Buffer.alloc(4 + reason.length);
  close[0] = 0x88; // FIN, close
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
export const server = (options: ServerOptions) =>
  Effect.acquireRelease(
    Effect.callback<
      { readonly port: number; readonly close: () => void },
      Error
    >((resume) => {
      const allowed = guard(options.key, options.origins);
      const open = new Set<Socket>();
      const listener = createServer((request, response) => {
        const refused = allowed(request);
        if (refused !== null) return answer(response, refused);
        if (pathOf(request.url) === HEALTH) {
          response.writeHead(200, { 'content-type': 'application/json' });
          return response.end('{"ok":true}');
        }
        const target = targetOf(request.url, options);
        if ('status' in target) return answer(response, target);
        if ('running' in target) return answerMismatch(response, target);
        pass(request, response, target);
      });
      listener.on(
        'upgrade',
        (request: IncomingMessage, socket: Socket, head) => {
          open.add(socket);
          socket.once('close', () => open.delete(socket));
          // Node leaves an upgraded socket without a listener: a caller that
          // resets it must not end the program, and anyone can.
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
            new Error(
              `Could not listen on ${HOST}:${options.port}: ${error.message}`,
              { cause: error },
            ),
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
