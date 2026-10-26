import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Effect, Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';
import { describe, expect, it } from 'vitest';
import { reach, single } from '../single.js';

/* One process per name, tried with two claims in one process: the socket does not care. */

const Control = RpcGroup.make(
  Rpc.make('status', { success: Schema.Struct({ owner: Schema.String }) }),
);

const handlers = (owner: string) =>
  Control.toLayer({ status: () => Effect.succeed({ owner }) });

const socketIn = () =>
  join(mkdtempSync(join(tmpdir(), 'kestack-single-')), 'work.sock');

describe('single', () => {
  it('gives the second claim a client to the first, which answers its status', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const path = socketIn();
          const first = yield* single(path, {
            group: Control,
            handlers: handlers('first'),
          });
          expect(first._tag).toBe('Acquired');
          const second = yield* single(path, {
            group: Control,
            handlers: handlers('second'),
          });
          if (second._tag !== 'AlreadyRunning')
            throw new Error('the second claim took the name');
          expect(yield* second.client.status()).toEqual({ owner: 'first' });
          const reached = yield* reach(path, Control);
          expect(yield* reached.status()).toEqual({ owner: 'first' });
        }),
      ),
    ));

  it('takes over the socket file a process that died left behind', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const path = socketIn();
          // A process that listens and exits without closing leaves the file.
          execFileSync(process.execPath, [
            '-e',
            `require('net').createServer().listen(${JSON.stringify(path)}, () => process.exit(0))`,
          ]);
          expect(existsSync(path)).toBe(true);
          const failed = yield* Effect.flip(reach(path, Control));
          expect(failed._tag).toBe('NotRunning');
          const claimed = yield* single(path, {
            group: Control,
            handlers: handlers('new'),
          });
          expect(claimed._tag).toBe('Acquired');
          const reached = yield* reach(path, Control);
          expect(yield* reached.status()).toEqual({ owner: 'new' });
        }),
      ),
    ));

  it('frees the name when its Scope closes', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const path = socketIn();
        yield* Effect.scoped(
          single(path, { group: Control, handlers: handlers('first') }),
        );
        const again = yield* Effect.scoped(
          single(path, { group: Control, handlers: handlers('again') }),
        );
        expect(again._tag).toBe('Acquired');
      }),
    ));
});
