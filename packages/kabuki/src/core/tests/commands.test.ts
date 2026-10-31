import { Effect, Schema } from 'effect';
import { TestClock } from 'effect/testing';
import { describe, expect, it, vi } from 'vitest';
import { init } from '../snapshot/engine/index.ts';
import { Actor, Command, History, Runtime } from '../index.ts';
import { Snapshot } from '../snapshot/index.ts';
import { Login, timed, Timer } from './fixtures.ts';

/* Commands: errands an Update asks for, each ending with at most one Message. */

describe('Commands', () => {
  it("sleep on Effect's Clock, and end with a Message stamped when it arrives", () =>
    timed(
      Effect.gen(function* () {
        const app = yield* Runtime.start(History.make(Timer));
        app.send('Timer', { _tag: 'Wait' });
        yield* TestClock.adjust('999 millis');
        expect(app.history.branch().length).toBe(1);
        yield* TestClock.adjust('1 millis');
        expect(app.history.branch().map((e) => [e.message._tag, e.at])).toEqual(
          [
            ['Wait', 0],
            ['Rang', 1000],
          ],
        );
        expect(app.history.branch()[1]!.source).toEqual({
          kind: 'command',
          instance: 'Timer',
          name: 'ring',
        });
      }),
    ));

  it('a Command whose Message does not match its Schema fails, and the Message never lands', () =>
    timed(
      Effect.gen(function* () {
        const failed = vi.spyOn(console, 'error').mockImplementation(() => {});
        const Liar = Actor.build(
          Actor.define('Liar', {
            message: Schema.TaggedUnion({
              Ask: {},
              Answered: { n: Schema.Number },
            }),
          }),
          {
            on: {
              Ask: () => ({
                command: Command.make('answer', {
                  run: () =>
                    Effect.succeed({ _tag: 'Answered', n: 'one' } as never),
                })(),
              }),
              Answered: () => ({}),
            },
          },
        );
        const app = yield* Runtime.start(History.make(Liar));
        app.send('Liar', { _tag: 'Ask' });
        yield* TestClock.adjust('1 millis');
        expect(app.history.branch().map((entry) => entry.message._tag)).toEqual(
          ['Ask'],
        );
        expect(failed.mock.calls.join(' ')).toMatch(
          /Liar command answer failed[\s\S]*Message "Answered" does not match its Schema/,
        );
        failed.mockRestore();
      }),
    ));

  it('what an Update asks for is data a test compares without running it', () => {
    const asked = Snapshot.handle(Login.definition, init(Login.definition), {
      destination: 'Login',
      message: { _tag: 'Submitted' },
      source: { kind: 'view', instance: 'Login' },
      at: 0,
    }).commands;
    expect(asked).toEqual([{ name: 'signIn', args: { name: '' } }]);
  });

  it('a Command whose args do not match their Schema fails when it runs, never in the Update', () =>
    timed(
      Effect.gen(function* () {
        const failed = vi.spyOn(console, 'error').mockImplementation(() => {});
        const save = Command.make('save', {
          args: Schema.Struct({ id: Schema.Number }),
          run: () => Effect.succeed({ _tag: 'Saved' as const }),
        });
        const Form = Actor.build(
          Actor.define('Form', {
            message: Schema.TaggedUnion({ Save: {}, Saved: {} }),
          }),
          {
            on: {
              Save: () => ({ command: save({ id: 'three' } as never) }),
              Saved: () => ({}),
            },
          },
        );
        const app = yield* Runtime.start(History.make(Form));
        app.send('Form', { _tag: 'Save' });
        yield* TestClock.adjust('1 millis');
        expect(app.history.branch().map((entry) => entry.message._tag)).toEqual(
          ['Save'],
        );
        expect(failed.mock.calls.join(' ')).toMatch(
          /Form command save failed[\s\S]*Command save: its args do not match their Schema/,
        );
        failed.mockRestore();
      }),
    ));

  it('a list of Commands runs concurrently', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* Runtime.start(History.make(Timer));
        app.send('Timer', { _tag: 'Both' });
        yield* TestClock.adjust('1 second');
        expect(app.history.branch().map((e) => [e.message._tag, e.at])).toEqual(
          [
            ['Both', 0],
            ['Rang', 1000],
            ['Rang', 1000],
          ],
        );
      }),
    ));
});
