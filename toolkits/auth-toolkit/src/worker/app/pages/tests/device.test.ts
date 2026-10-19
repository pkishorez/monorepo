import { Effect } from 'effect';
import type { Running } from '@kestack/kabuki';
import { describe, expect, it } from 'vitest';
import { router } from '../index.ts';
import {
  find,
  harness,
  run,
  sendRouter,
  sendTo,
  settle,
  twoAccounts,
} from './harness.ts';

/*
 * The Device Screen's answer is for the code it answered: a move to
 * another code, or to none, starts the question again.
 */

const state = (app: Running<unknown>) => find(app, 'Device')!.state;

const withCodes = () => {
  const server = twoAccounts();
  server.devices = {
    AAAA1111: { userCode: 'AAAA1111', status: 'pending', app: 'acme-cli' },
    BBBB2222: { userCode: 'BBBB2222', status: 'pending', app: 'notes-cli' },
  };
  return server;
};

const approved = (app: Running<unknown>) =>
  Effect.gen(function* () {
    sendTo(app, 'Device', { _tag: 'Approved', userId: 'ada' });
    yield* settle;
    expect(state(app)).toEqual({
      _tag: 'Done',
      code: 'AAAA1111',
      app: 'acme-cli',
      approved: true,
    });
  });

describe('the Device Screen after an answer', () => {
  it('Back to it with no code: the code to enter, not the old success', () =>
    run(
      Effect.gen(function* () {
        const tab = harness(withCodes());
        const app = yield* tab.open('/device');
        yield* settle;
        sendRouter(app, {
          _tag: 'Pushed',
          route: router.Device({ code: 'AAAA1111' }),
        });
        yield* settle;
        yield* approved(app);
        sendRouter(app, { _tag: 'Went', by: -1 });
        yield* settle;
        expect(state(app)).toEqual({ _tag: 'Asking', failure: null });
      }),
    ));

  it('a move to another code asks about that one', () =>
    run(
      Effect.gen(function* () {
        const tab = harness(withCodes());
        const app = yield* tab.open('/device?code=AAAA1111');
        yield* settle;
        yield* approved(app);
        sendRouter(app, {
          _tag: 'Pushed',
          route: router.Device({ code: 'BBBB2222' }),
        });
        yield* settle;
        expect(state(app)).toEqual({ _tag: 'Asking', failure: null });
        sendTo(app, 'Device', { _tag: 'Approved', userId: 'ada' });
        yield* settle;
        expect(state(app)).toEqual({
          _tag: 'Done',
          code: 'BBBB2222',
          app: 'notes-cli',
          approved: true,
        });
      }),
    ));

  it('an ended code’s failure stays with it', () =>
    run(
      Effect.gen(function* () {
        const tab = harness(withCodes());
        const app = yield* tab.open('/device?code=AAAA1111');
        yield* settle;
        tab.server.devices = {};
        sendTo(app, 'Device', { _tag: 'Approved', userId: 'ada' });
        yield* settle;
        sendRouter(app, { _tag: 'Pushed', route: router.Device() });
        yield* settle;
        expect(state(app)).toEqual({ _tag: 'Asking', failure: null });
      }),
    ));
});
