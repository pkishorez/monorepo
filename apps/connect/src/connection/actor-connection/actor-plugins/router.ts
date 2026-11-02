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
import { PluginAccess } from '@kestack/cli-platform/plugins/contract';
import {
  mismatchReason,
  PLUGIN_MISMATCH,
  pluginOfPath,
  publicOfPath,
} from '../../../cloud/contract/index.js';
import { guard, HEALTH, pathOf, type Refusal, withoutKey } from './guard.js';

/*
 * The Connection's one public port, which its tunnel points at. After the
 * guard, `GET /health` answers here, and the rest is passed by Plugin name
 * to that Plugin's socket, its query kept: a WebSocket as raw bytes, once
 * its upgrade request is written on, and any other request through an
 * HTTP request of its own. `/<plugin>/<sha256>/<rest>` is passed as
 * `/<rest>` when the Plugin runs that Release. A Release it does not run
 * is refused with what it runs: a WebSocket is taken and closed at once
 * with 4409, its reason saying so, since a browser reads nothing else of
 * it; any other request answers 409 with the same JSON. The Plugin's
 * Public Area, `/<plugin>/public/<rest>`, is passed as `/public/<rest>` at
 * whatever Release runs, and takes no WebSocket (ADR 0008). Every request
 * reaches the Plugin with `x-ke-connect-access` (PluginAccess) saying how it came in,
 * `key` or `public`, whatever the caller sent in its place: the Plugin
 * trusts that header alone to say which of its routes it may reach. The
 * router never reads what passes: Code and the Plugin type it end to end.
 * A Plugin not listening yet answers 503; a name that is no Plugin, and
 * any other path, 404.
 */

/** How a request came in, as a Plugin reads it in PluginAccess's header: with the key, or to its Public Area. */
type Access = typeof PluginAccess.key | typeof PluginAccess.public;

const ACCESS = PluginAccess.header;

export interface RouterOptions {
  /** The port to listen on; 0 for any free one. */
  readonly port: number;
  /** The Connection Key. */
  readonly key: string;
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

/** A Plugin's socket, the path on it, and how the request came in. */
interface Pass {
  readonly socket: string;
  readonly path: string;
  readonly access: Access;
}

type Target = Pass | Refusal | Mismatch;

const noPlugin = (name: string): Refusal => ({
  status: 404,
  text: `This Connection runs no Plugin ${name}`,
});

/** Where a request goes: a Plugin's socket and the path on it, or why it goes nowhere. */
const targetOf = (url: string | undefined, options: RouterOptions): Target => {
  const path = pathOf(url) ?? '';
  const query = (url ?? '').slice(path.length);
  const open = publicOfPath(path);
  if (open !== null) {
    const socket = options.socketOf(open.name);
    return socket === null
      ? noPlugin(open.name)
      : { socket, path: `${open.path}${query}`, access: PluginAccess.public };
  }
  const release = pluginOfPath(path);
  if (release === null) return { status: 404, text: 'Not found' };
  const socket = options.socketOf(release.name);
  if (socket === null) return noPlugin(release.name);
  const running = options.otherThan(release.name, release.hash);
  return running === undefined
    ? { socket, path: `${release.path}${query}`, access: PluginAccess.key }
    : { running };
};

const NO_WEBSOCKET: Refusal = {
  status: 400,
  text: 'A Public Area takes no WebSocket',
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

/**
 * Takes a WebSocket that asked for a Release the Plugin does not run, and
 * closes it at once with 4409, its reason saying which it runs. It selects
 * `ke-connect`, as a Plugin does, never the key: a browser drops a socket
 * that selects none of what it offered.
 */
const closeMismatch = (
  request: IncomingMessage,
  socket: Socket,
  { running }: Mismatch,
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
  const reason = Buffer.from(mismatchReason(running));
  const close = Buffer.alloc(4 + reason.length);
  close[0] = 0x88; // FIN, close
  close[1] = 2 + reason.length;
  close.writeUInt16BE(PLUGIN_MISMATCH, 2);
  reason.copy(close, 4);
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n` +
      (protocol === undefined
        ? ''
        : `Sec-WebSocket-Protocol: ${protocol}\r\n`) +
      '\r\n',
  );
  socket.end(close);
};

/** The request's headers to pass on: its subprotocols without the key, and how it came in. */
const passedHeaders = (request: IncomingMessage, access: Access) => {
  const headers = { ...request.headers };
  const protocols = withoutKey(headers['sec-websocket-protocol']);
  if (protocols === undefined) delete headers['sec-websocket-protocol'];
  else headers['sec-websocket-protocol'] = protocols;
  headers[ACCESS] = access;
  return headers;
};

/** The upgrade request's head, as the Plugin is to read it: at `path`, without the key, saying how it came in. */
const headOf = (request: IncomingMessage, { path, access }: Pass) => {
  const lines = [`${request.method} ${path} HTTP/${request.httpVersion}`];
  const raw = request.rawHeaders;
  for (let at = 0; at < raw.length; at += 2) {
    const name = raw[at]!;
    const lower = name.toLowerCase();
    if (lower === ACCESS) continue;
    if (lower !== 'sec-websocket-protocol') {
      lines.push(`${name}: ${raw[at + 1]}`);
      continue;
    }
    const protocols = withoutKey(raw[at + 1]);
    if (protocols !== undefined) lines.push(`${name}: ${protocols}`);
  }
  lines.push(`${ACCESS}: ${access}`);
  return `${lines.join('\r\n')}\r\n\r\n`;
};

/** Passes a plain HTTP request to a Plugin's socket, and its answer back. */
const pass = (
  request: IncomingMessage,
  response: ServerResponse,
  target: Pass,
) => {
  const upstream = httpRequest(
    {
      socketPath: target.socket,
      path: target.path,
      method: request.method,
      headers: passedHeaders(request, target.access),
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
  target: Pass,
  open: Set<Socket>,
) => {
  const upstream = connect({ path: target.socket });
  open.add(upstream);
  let connected = false;
  upstream.once('connect', () => {
    connected = true;
    upstream.write(headOf(request, target));
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
        const target = targetOf(request.url, options);
        if ('status' in target) return answer(response, target);
        if ('running' in target) return answerMismatch(response, target);
        if (
          target.access === PluginAccess.public &&
          request.headers.upgrade !== undefined
        )
          return answer(response, NO_WEBSOCKET);
        pass(request, response, target);
      });
      server.on('upgrade', (request: IncomingMessage, socket: Socket, head) => {
        open.add(socket);
        socket.once('close', () => open.delete(socket));
        const refused = allowed(request);
        if (refused !== null) return answerRaw(socket, refused);
        const target = targetOf(request.url, options);
        if ('status' in target) return answerRaw(socket, target);
        if ('running' in target) return closeMismatch(request, socket, target);
        if (target.access === PluginAccess.public)
          return answerRaw(socket, NO_WEBSOCKET);
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
