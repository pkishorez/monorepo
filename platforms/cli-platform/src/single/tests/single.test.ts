import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Effect, Exit, Fiber, Schema, Scope } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';
import { describe, expect, it } from 'vitest';
import { tryLock } from '../../files/lock/index.js';
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

  it(
    'lets one of many claims at once take over a socket file a process that died left behind',
    () =>
      Effect.runPromise(
        Effect.forEach(
          Array.from({ length: 10 }, (_, round) => round),
          () =>
            Effect.scoped(
              Effect.gen(function* () {
                const path = socketIn();
                execFileSync(process.execPath, [
                  '-e',
                  `require('net').createServer().listen(${JSON.stringify(path)}, () => process.exit(0))`,
                ]);
                const claims = yield* Effect.all(
                  Array.from({ length: 8 }, (_, i) =>
                    single(path, {
                      group: Control,
                      handlers: handlers(`${i}`),
                    }),
                  ),
                  { concurrency: 'unbounded' },
                );
                const acquired = claims.filter(
                  (claim) => claim._tag === 'Acquired',
                );
                expect(acquired).toHaveLength(1);
                const reached = yield* reach(path, Control);
                const { owner } = yield* reached.status();
                for (const claim of claims)
                  if (claim._tag === 'AlreadyRunning')
                    expect(yield* claim.client.status()).toEqual({ owner });
              }),
            ),
        ),
      ),
    30_000,
  );

  it('binds only holding the lock, so a takeover under way never deletes a fresh claim', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const path = socketIn();
          const owner = yield* Scope.make();
          const first = yield* single(path, {
            group: Control,
            handlers: handlers('first'),
          }).pipe(Scope.provide(owner));
          expect(first._tag).toBe('Acquired');
          // A takeover between its look and its delete holds the lock, as
          // the owner closes and frees the socket.
          const takeover = yield* Scope.make();
          expect(yield* tryLock(path).pipe(Scope.provide(takeover))).toBe(true);
          yield* Scope.close(owner, Exit.void);
          expect(existsSync(path)).toBe(false);
          const fresh = yield* single(path, {
            group: Control,
            handlers: handlers('fresh'),
          }).pipe(Effect.forkScoped);
          yield* Effect.sleep('300 millis');
          // The fresh claim waits for the lock, so the delete takes nothing.
          expect(existsSync(path)).toBe(false);
          rmSync(path, { force: true });
          yield* Scope.close(takeover, Exit.void);
          expect((yield* Fiber.join(fresh))._tag).toBe('Acquired');
          const reached = yield* reach(path, Control);
          expect(yield* reached.status()).toEqual({ owner: 'fresh' });
        }),
      ),
    ));
});
