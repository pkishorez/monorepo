import { mkdirSync, writeFileSync } from 'node:fs';
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import { reach } from '@kestack/cli-platform/single';
import { ConnectionControl, hold } from '../index.js';
import { remembered, rememberedFile } from '../remember.js';
import {
  eventually,
  fake,
  inputOf,
  release,
  start,
} from './fixtures/connection.js';

/*
 * What a Connection last wanted, and its control socket, real in a runtime
 * folder of the test's own.
 */

describe('what it last wanted', () => {
  it(
    'starts its Plugins at the Releases it last wanted while Connect Cloud cannot be reached',
    () =>
      Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const ping = release();
            const { host } = fake({
              healthy: () => true,
              answer: () => null,
            });
            const { root } = yield* start(host, {
              ...inputOf(),
              lastWanted: { ping },
            });
            yield* eventually(
              () =>
                expect(root().model.plugins['ping']).toEqual({
                  _tag: 'Running',
                  hash: ping.hash,
                }),
              20_000,
            );
          }),
        ),
      ),
    30_000,
  );

  it('keeps each answer on disk, and the answer wins over what it last wanted', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const before = release();
          const after = release('// newer\n');
          const { host } = fake({
            healthy: () => true,
            answer: () => ({ ping: after }),
          });
          const input = {
            ...inputOf(),
            lastWanted: { ping: before },
          };
          const { root } = yield* start(host, input);
          yield* eventually(() =>
            expect(root().model.wanted['ping']).toEqual(after),
          );
          yield* eventually(() =>
            expect(Effect.runSync(remembered(input.folders.data))).toEqual({
              ping: after,
            }),
          );
        }),
      ),
    ));

  it('reads nothing from no file, or one it cannot read', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const { folders } = inputOf();
        expect(yield* remembered(folders.data)).toEqual({});
        mkdirSync(folders.data, { recursive: true });
        writeFileSync(rememberedFile(folders.data), 'not json');
        expect(yield* remembered(folders.data)).toEqual({});
      }),
    ));
});

describe('its control socket', () => {
  it('says how it stands, stops it, and is held by one Connection of a name at a time', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const input = inputOf();
          const { host } = fake({ healthy: () => true });
          const first = yield* start(host, input);
          yield* eventually(() =>
            expect(first.root().model.url).toBe('https://t1.example'),
          );
          const control = yield* reach(input.control, ConnectionControl);
          expect(yield* control.status()).toEqual({
            name: 'test',
            id: 'connection-1',
            url: 'https://t1.example',
            plugins: {},
          });

          const second = yield* Effect.scoped(hold(input.control, input.name));
          expect(second._tag).toBe('AlreadyRunning');

          yield* Effect.forkScoped(control.stop());
          expect(yield* first.stopped).toBeNull();
        }),
      ),
    ));

  it('says no Connection runs yet as starting, and stopping then ends the program', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const input = inputOf();
          const held = yield* hold(input.control, input.name);
          if (held._tag !== 'Held') return expect.fail('not held');
          const control = yield* reach(input.control, ConnectionControl);
          expect(yield* control.status()).toEqual({
            name: 'test',
            id: '',
            url: null,
            plugins: {},
          });
          yield* control.stop();
          yield* held.stopping;
        }),
      ),
    ));
});

describe('its control socket, once the Connection is gone', () => {
  it('answers as starting again, so `stop` still ends the program', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const input = inputOf();
        const held = yield* hold(input.control, input.name);
        if (held._tag !== 'Held') return expect.fail('not held');
        const control = yield* reach(input.control, ConnectionControl);
        yield* Effect.scoped(
          held.control.answer({
            status: Effect.succeed({
              name: 'test',
              id: 'connection-1',
              url: null,
              plugins: {},
            }),
            stop: Effect.void,
          }),
        );
        expect((yield* control.status()).id).toBe('');
      }).pipe(Effect.scoped),
    ));
});
