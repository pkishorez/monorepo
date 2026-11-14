import * as Effect from 'effect/Effect';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Haptics } from '../index.ts';

/*
 * The web's Haptics, the one an app gets when it provides none:
 * `navigator.vibrate`, stubbed here, with what it buzzed and whether it
 * took it.
 */

const all = Effect.gen(function* () {
  const haptics = yield* Haptics;
  return [
    yield* haptics.impact('medium'),
    yield* haptics.notify('success'),
    yield* haptics.selection,
  ];
});

afterEach(() => vi.unstubAllGlobals());

describe('Haptics on the web', () => {
  it('buzzes through navigator.vibrate, with no Layer provided', async () => {
    const vibrate = vi.fn(() => true);
    vi.stubGlobal('navigator', { vibrate });
    expect(await Effect.runPromise(all)).toEqual([true, true, true]);
    expect(vibrate.mock.calls).toEqual([[16], [[8, 60, 14]], [4]]);
  });

  it('says false when the browser refuses, as it does before a touch', async () => {
    vi.stubGlobal('navigator', { vibrate: () => false });
    expect(await Effect.runPromise(all)).toEqual([false, false, false]);
  });

  it('says false where there is no navigator.vibrate, as on iOS', async () => {
    vi.stubGlobal('navigator', {});
    expect(await Effect.runPromise(all)).toEqual([false, false, false]);
  });

  it('says false with no navigator at all, as on a server', async () => {
    vi.stubGlobal('navigator', undefined);
    expect(await Effect.runPromise(all)).toEqual([false, false, false]);
  });
});
