import * as Effect from 'effect/Effect';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Haptics } from '../../web/index.ts';
import { ios } from '../index.ts';

/*
 * Haptics in the iOS shell, with Capacitor's plugin mocked: each call is
 * the plugin's, and one the plugin rejects is `false`.
 */

const plugin = vi.hoisted(() => ({
  impact: vi.fn<(options: unknown) => Promise<void>>(async () => {}),
  notification: vi.fn<(options: unknown) => Promise<void>>(async () => {}),
  selectionStart: vi.fn(async () => {}),
  selectionChanged: vi.fn(async () => {}),
  selectionEnd: vi.fn(async () => {}),
}));

vi.mock('@capacitor/haptics', () => ({
  Haptics: plugin,
  ImpactStyle: { Light: 'LIGHT', Medium: 'MEDIUM', Heavy: 'HEAVY' },
  NotificationType: {
    Success: 'SUCCESS',
    Warning: 'WARNING',
    Error: 'ERROR',
  },
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('Haptics on iOS', () => {
  it("is the plugin's, once the app's Layer is built in the shell", async () => {
    vi.stubGlobal('webkit', { messageHandlers: { bridge: {} } });
    const took = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const haptics = yield* Haptics;
          return [
            yield* haptics.impact('heavy'),
            yield* haptics.notify('warning'),
            yield* haptics.selection,
          ];
        }),
        Haptics.layer({ ios }),
      ),
    );
    expect(took).toEqual([true, true, true]);
    expect(plugin.impact).toHaveBeenCalledWith({ style: 'HEAVY' });
    expect(plugin.notification).toHaveBeenCalledWith({ type: 'WARNING' });
    expect(plugin.selectionStart).toHaveBeenCalledOnce();
    expect(plugin.selectionChanged).toHaveBeenCalledOnce();
    expect(plugin.selectionEnd).toHaveBeenCalledOnce();
  });

  it('says false when the plugin rejects', async () => {
    plugin.impact.mockRejectedValueOnce(new Error('no engine'));
    const haptics = await Effect.runPromise(ios);
    expect(await Effect.runPromise(haptics.impact('light'))).toBe(false);
  });
});
