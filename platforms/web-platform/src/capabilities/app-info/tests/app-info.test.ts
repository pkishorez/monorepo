import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppInfo } from '../web/index.ts';
import { android } from '../android/index.ts';
import { ios } from '../ios/index.ts';

/*
 * App Info with Capacitor's App plugin mocked: in a shell it says the
 * platform and what the device knows of the app; a plugin that does not
 * answer is no shell. With nothing provided, it is the web's: no shell.
 */

const getInfo = vi.hoisted(() => vi.fn());

vi.mock('@capacitor/app', () => ({ App: { getInfo } }));

const shell = {
  id: 'app.kishore.start',
  name: 'Kabuki Start',
  version: '1.2.0',
  build: '7',
};

const read = (layer = AppInfo.layer({ ios, android })) =>
  Effect.runPromise(
    Effect.provide(
      Effect.gen(function* () {
        const info = yield* AppInfo;
        return { platform: info.platform, shell: yield* info.shell };
      }),
      layer,
    ),
  );

afterEach(() => {
  vi.unstubAllGlobals();
  getInfo.mockReset();
});

describe('App Info', () => {
  it('says web and no shell in a browser, and asks no plugin', async () => {
    expect(await read()).toEqual({ platform: 'web', shell: Option.none() });
    expect(getInfo).not.toHaveBeenCalled();
  });

  it("says the iOS shell's details in it", async () => {
    vi.stubGlobal('webkit', { messageHandlers: { bridge: {} } });
    getInfo.mockResolvedValue({ ...shell, extra: 'not ours' });
    expect(await read()).toEqual({
      platform: 'ios',
      shell: Option.some(shell),
    });
  });

  it("says the Android shell's details in it", async () => {
    vi.stubGlobal('androidBridge', {});
    getInfo.mockResolvedValue(shell);
    expect(await read()).toEqual({
      platform: 'android',
      shell: Option.some(shell),
    });
  });

  it('is no shell when the plugin does not answer', async () => {
    vi.stubGlobal('androidBridge', {});
    getInfo.mockRejectedValue(new Error('not implemented'));
    expect(await read()).toEqual({
      platform: 'android',
      shell: Option.none(),
    });
  });
});
