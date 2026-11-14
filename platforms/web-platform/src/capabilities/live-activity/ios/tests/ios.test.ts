import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LiveActivity } from '../../web/index.ts';
import { ios } from '../index.ts';

/*
 * Live Activities in the iOS shell, with `@capacitor/core` mocked: the
 * plugin is a Proxy that answers every name, `then` too, as Capacitor's
 * does. Each call is the plugin's, and one it rejects is `false` or none.
 */

const plugin = vi.hoisted(() => ({
  isSupported: vi.fn(async () => ({ supported: true })),
  start: vi.fn<(options: unknown) => Promise<{ id: string }>>(async () => ({
    id: 'activity-1',
  })),
  update: vi.fn<(options: unknown) => Promise<void>>(async () => {}),
  end: vi.fn<(options: unknown) => Promise<void>>(async () => {}),
}));

// What Capacitor's Proxy answers for `then`: a call to native code.
const thenCall = vi.hoisted(() => vi.fn());

const registerPlugin = vi.hoisted(() =>
  vi.fn(
    (_name: string) =>
      new Proxy(
        {},
        {
          get: (_, name) =>
            name === 'then'
              ? thenCall
              : (plugin[name as keyof typeof plugin] ?? vi.fn()),
        },
      ),
  ),
);

vi.mock('@capacitor/core', () => ({ registerPlugin }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('Live Activity on iOS', () => {
  it("is the Shell's plugin, once the app's Layer is built in the shell", async () => {
    vi.stubGlobal('webkit', { messageHandlers: { bridge: {} } });
    const answers = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const live = yield* LiveActivity;
          return [
            yield* live.supported,
            yield* live.start({
              title: 'Kabuki Start',
              status: 'Started',
              progress: 0,
            }),
            yield* live.update('activity-1', {
              status: 'Halfway',
              progress: 0.5,
            }),
            yield* live.end('activity-1'),
          ];
        }),
        LiveActivity.layer({ ios }),
      ),
    );
    expect(answers).toEqual([true, Option.some('activity-1'), true, true]);
    expect(registerPlugin).toHaveBeenCalledWith('LiveActivity');
    expect(plugin.start).toHaveBeenCalledWith({
      title: 'Kabuki Start',
      status: 'Started',
      progress: 0,
    });
    expect(plugin.update).toHaveBeenCalledWith({
      id: 'activity-1',
      status: 'Halfway',
      progress: 0.5,
    });
    expect(plugin.end).toHaveBeenCalledWith({ id: 'activity-1' });
  });

  it('never treats the plugin as a Promise', async () => {
    const live = await Effect.runPromise(ios);
    expect(await Effect.runPromise(live.supported)).toBe(true);
    expect(thenCall).not.toHaveBeenCalled();
  });

  it('says not supported, none and false when the plugin rejects', async () => {
    plugin.isSupported.mockRejectedValueOnce(new Error('not implemented'));
    plugin.start.mockRejectedValueOnce(new Error('refused'));
    plugin.update.mockRejectedValueOnce(new Error('unknown id'));
    plugin.end.mockRejectedValueOnce(new Error('unknown id'));
    const live = await Effect.runPromise(ios);
    expect(
      await Effect.runPromise(
        Effect.all([
          live.supported,
          live.start({ title: 'Kabuki Start', status: 'Started' }),
          live.update('gone', { status: 'Halfway' }),
          live.end('gone'),
        ]),
      ),
    ).toEqual([false, Option.none(), false, false]);
  });
});
