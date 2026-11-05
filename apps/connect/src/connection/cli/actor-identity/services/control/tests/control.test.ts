import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Effect, Schema } from 'effect';
import { afterEach, describe, expect, it } from 'vitest';
import { socketPath } from '@kestack/cli-platform/files';
import { reach } from '@kestack/cli-platform/single';
import { ConnectionControl, hold, RunningConnection } from '../index.js';

/* The control socket `serve` holds, real in a runtime folder of the test's own. */

const made: Array<string> = [];
afterEach(() => {
  for (const folder of made.splice(0))
    rmSync(folder, { recursive: true, force: true });
});
const socket = () => {
  const runtime = mkdtempSync(join(tmpdir(), 'connect-'));
  made.push(runtime);
  return socketPath(runtime, 'c0ffee00', 'connect');
};

describe('the control socket', () => {
  it('is held by one Connection of a name at a time', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const path = socket();
          expect((yield* hold(path, 'test'))._tag).toBe('Held');
          const second = yield* Effect.scoped(hold(path, 'test'));
          expect(second._tag).toBe('AlreadyRunning');
        }),
      ),
    ));

  it('says no Connection runs yet as starting, and stopping then ends the program', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const path = socket();
          const held = yield* hold(path, 'test');
          if (held._tag !== 'Held') return expect.fail('not held');
          const control = yield* reach(path, ConnectionControl);
          expect(yield* control.status()).toEqual({
            name: 'test',
            id: '',
            url: null,
          });
          yield* control.stop();
          yield* held.stopping;
        }),
      ),
    ));

  it('answers as it is told, and as starting again once that ends', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const path = socket();
          const held = yield* hold(path, 'test');
          if (held._tag !== 'Held') return expect.fail('not held');
          const control = yield* reach(path, ConnectionControl);
          yield* Effect.scoped(
            Effect.gen(function* () {
              yield* held.control.answer({
                status: Effect.succeed({
                  name: 'test',
                  id: 'connection-1',
                  url: 'https://t1.example',
                }),
                stop: Effect.void,
              });
              expect(yield* control.status()).toEqual({
                name: 'test',
                id: 'connection-1',
                url: 'https://t1.example',
              });
            }),
          );
          expect((yield* control.status()).id).toBe('');
        }),
      ),
    ));
});

describe('what a Connection says of itself', () => {
  it('reads from an older `ke-connect`, which also says where each Plugin stands', () => {
    expect(
      Schema.decodeUnknownSync(RunningConnection.schema)({
        _v: 'v1',
        name: 'test',
        id: 'connection-1',
        url: 'https://t1.example',
        plugins: { ping: { _tag: 'Running', hash: 'h' } },
      }),
    ).toEqual({
      name: 'test',
      id: 'connection-1',
      url: 'https://t1.example',
    });
  });
});
