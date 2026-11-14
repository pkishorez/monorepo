import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import type * as Layer from 'effect/Layer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { layerOn, platform } from '../index.ts';

/*
 * The platform is read from the bridge a shell puts into the page, so each
 * test stubs that bridge. A Capability's Layer is tried with a Reference of
 * its own, whose default stands for the web's.
 */

const onIos = () =>
  vi.stubGlobal('webkit', { messageHandlers: { bridge: {} } });
const onAndroid = () => vi.stubGlobal('androidBridge', {});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('platform', () => {
  it('is web with no bridge', () => {
    expect(platform()).toBe('web');
  });

  it('is web in Safari, which has webkit but no bridge', () => {
    vi.stubGlobal('webkit', { messageHandlers: {} });
    expect(platform()).toBe('web');
  });

  it('is ios in the iOS shell', () => {
    onIos();
    expect(platform()).toBe('ios');
  });

  it('is android in the Android shell', () => {
    onAndroid();
    expect(platform()).toBe('android');
  });
});

const Greeting = Context.Reference<string>('test/Greeting', {
  defaultValue: () => 'web',
});

const greeting = (layer: Layer.Layer<never>) =>
  Effect.runPromise(
    Effect.provide(
      Effect.gen(function* () {
        return yield* Greeting;
      }),
      layer,
    ),
  );

describe('layerOn', () => {
  const layer = layerOn(Greeting)({
    ios: Effect.succeed('ios'),
    android: Effect.succeed('android'),
  });

  it('keeps the default in a browser, and makes nothing', async () => {
    const ios = vi.fn(() => 'ios');
    expect(await greeting(layerOn(Greeting)({ ios: Effect.sync(ios) }))).toBe(
      'web',
    );
    expect(ios).not.toHaveBeenCalled();
  });

  it("is the platform's own on that platform", async () => {
    onIos();
    expect(await greeting(layer)).toBe('ios');
    vi.unstubAllGlobals();
    onAndroid();
    expect(await greeting(layer)).toBe('android');
  });

  it('keeps the default on a platform it names nothing for', async () => {
    onAndroid();
    expect(
      await greeting(layerOn(Greeting)({ ios: Effect.succeed('ios') })),
    ).toBe('web');
  });

  it('keeps the default, and says so, when making it fails', async () => {
    onIos();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(
      await greeting(layerOn(Greeting)({ ios: Effect.fail('gone') })),
    ).toBe('web');
    expect(error).toHaveBeenCalledOnce();
  });

  it('keeps the default when making it throws', async () => {
    onIos();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const ios = Effect.sync((): string => {
      throw new Error('no plugin');
    });
    expect(await greeting(layerOn(Greeting)({ ios }))).toBe('web');
  });
});
