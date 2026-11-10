import { connect, type Socket } from 'node:net';
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import { KEY_EXPIRED } from '../../../../../../connection/link/index.js';
import { server } from '../index.js';

/*
 * How a refused WebSocket closes, as the bytes on the wire. A tunnel between
 * the server and its caller loses a close followed straight away by the end
 * of the socket, and the caller reads only 1006, so the server must wait for
 * the caller's own close. A WebSocket client hides this, as it answers at once.
 */

const PATH = `/code/${'a'.repeat(64)}/rpc`;

/** A raw upgrade offering the key `key`: the socket, and everything received on it. */
const upgrade = (port: number, key: string) =>
  new Promise<{ socket: Socket; received: () => Buffer; ended: Promise<void> }>(
    (resolve, reject) => {
      const socket = connect({ host: '127.0.0.1', port });
      let received = Buffer.alloc(0);
      const ended = new Promise<void>((done) => socket.once('close', done));
      socket.on('error', reject);
      socket.on('data', (chunk) => {
        received = Buffer.concat([received, chunk]);
        if (received.includes(Buffer.from('\r\n\r\n')))
          resolve({ socket, received: () => received, ended });
      });
      socket.write(
        [
          `GET ${PATH} HTTP/1.1`,
          'Host: 127.0.0.1',
          'Connection: Upgrade',
          'Upgrade: websocket',
          'Sec-WebSocket-Version: 13',
          `Sec-WebSocket-Key: ${Buffer.from('0123456789abcdef').toString('base64')}`,
          `Sec-WebSocket-Protocol: ke-connect, key.${key}`,
          '',
          '',
        ].join('\r\n'),
      );
    },
  );

const waiting = (ms: number) =>
  new Promise<'still open'>((done) => setTimeout(() => done('still open'), ms));

/** A masked frame a client sends: a text frame, or its close. */
const TEXT = Buffer.from([0x81, 0x82, 0, 0, 0, 0, 0x68, 0x69]);
const CLOSE = Buffer.from([0x88, 0x80, 0, 0, 0, 0]);

const serverAt = () =>
  server({
    port: 0,
    origins: [],
    key: () => 'current',
    socketOf: () => null,
    otherThan: () => null,
  });

describe('a refused WebSocket', () => {
  it('waits for the close itself, whatever the caller sends first', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const port = yield* serverAt();
          const { socket, ended } = yield* Effect.promise(() =>
            upgrade(port, 'old'),
          );
          socket.write(TEXT);
          expect(
            yield* Effect.promise(() => Promise.race([ended, waiting(100)])),
          ).toBe('still open');
          // Split, as a slow network would.
          socket.write(CLOSE.subarray(0, 1));
          yield* Effect.promise(() => waiting(20));
          socket.end(CLOSE.subarray(1));
          yield* Effect.promise(() => ended);
        }),
      ),
    ));

  it('survives a caller that resets its socket', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const port = yield* serverAt();
          const { socket, ended } = yield* Effect.promise(() =>
            upgrade(port, 'old'),
          );
          socket.resetAndDestroy();
          yield* Effect.promise(() => ended);
          yield* Effect.promise(() => waiting(50));
          const health = yield* Effect.promise(() =>
            fetch(`http://127.0.0.1:${port}/health`),
          );
          expect(health.status).toBe(200);
        }),
      ),
    ));

  it(
    'is cut after five seconds, however much the caller keeps sending',
    () =>
      Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const port = yield* serverAt();
            const { socket, ended } = yield* Effect.promise(() =>
              upgrade(port, 'old'),
            );
            const dripping = setInterval(() => {
              if (!socket.destroyed) socket.write(TEXT);
            }, 1_000);
            yield* Effect.promise(() => ended);
            clearInterval(dripping);
          }),
        ),
      ),
    8_000,
  );

  it('stays open after its close, until the caller answers', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const port = yield* server({
            port: 0,
            origins: [],
            key: () => 'current',
            socketOf: () => null,
            otherThan: () => null,
          });
          const { socket, received, ended } = yield* Effect.promise(() =>
            upgrade(port, 'old'),
          );
          yield* Effect.promise(() => waiting(100));
          const bytes = received();
          const frame = bytes.subarray(
            bytes.indexOf(Buffer.from('\r\n\r\n')) + 4,
          );
          expect(frame[0]).toBe(0x88);
          expect(frame.readUInt16BE(2)).toBe(KEY_EXPIRED);
          expect(frame.subarray(4).toString()).toBe('key expired');
          expect(
            yield* Effect.promise(() => Promise.race([ended, waiting(100)])),
          ).toBe('still open');
          socket.end(Buffer.from([0x88, 0x80, 0, 0, 0, 0]));
          yield* Effect.promise(() => ended);
        }),
      ),
    ));
});
