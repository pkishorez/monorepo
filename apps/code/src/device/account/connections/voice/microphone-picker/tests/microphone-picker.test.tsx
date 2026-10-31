// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act, use, useRef } from 'react';
import { createRoot, type Root as ReactRoot } from 'react-dom/client';
import { Effect, Layer, Schema, Stream } from 'effect';
import { Actor } from '@kestack/kabuki';
import { View } from '@kestack/kabuki/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { keys } from '../../../layout/commands.ts';
import { Preferences } from '../../../../../store.ts';
import { preferencesMemory } from '../../../../../store.ts';
import { recorder } from '../../recorder/index.ts';
import { MicrophonePickerLive } from '../actor.ts';
import { MicrophonePickerView, Opener } from '../view.tsx';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/*
 * The Microphone Picker over the browser's own Recorder, with its media
 * devices stood in for. `d`, bound as Layout binds it, through `Opener`,
 * opens it from the page; the microphones'
 * names are blank until the site may use one, so it asks first, then
 * lists them, the system default first, the one chosen checked. Choosing
 * one keeps it in Preferences, and plugging one in shows it while open.
 */

const device = (deviceId: string, label: string): MediaDeviceInfo => ({
  deviceId,
  groupId: '',
  kind: 'audioinput',
  label,
  toJSON: () => ({}),
});

/** The browser's media devices, its microphones and what was asked of them. */
class Media extends EventTarget {
  allowed = false;
  asked = 0;
  stopped = 0;
  devices = [
    device('default', 'Default - MacBook Pro Microphone'),
    device('mac', 'MacBook Pro Microphone'),
    device('usb', 'Yeti'),
  ];
  enumerateDevices = async () =>
    this.devices.map((each) =>
      this.allowed ? each : device(each.deviceId, ''),
    );
  getUserMedia = async () => {
    this.asked++;
    this.allowed = true;
    return { getTracks: () => [{ stop: () => void this.stopped++ }] };
  };
}

let media = new Media();

const Owner = Actor.define('Owner', {
  requires: [Preferences],
  model: Schema.Struct({
    chosen: Schema.NullOr(Schema.String),
    pings: Schema.Finite,
  }),
  message: Schema.TaggedUnion({
    Ping: {},
    Read: { chosen: Schema.NullOr(Schema.String) },
  }),
});

/** Beside it, the microphone chosen, read again after every write, for the test to see. */
const OwnerLive = Actor.build(Owner, {
  init: () => ({ model: { chosen: null, pings: 0 } }),
  children: (child) => ({
    microphones: child(MicrophonePickerLive),
  }),
  workers: {
    device: {
      run: (self) =>
        Stream.runForEach(
          Stream.concat(Stream.make(undefined), Preferences.changes),
          () =>
            Effect.flatMap(Preferences.read, ({ microphone }) =>
              self.send({ _tag: 'Read', chosen: microphone }),
            ),
        ),
    },
  },
  on: {
    Ping: (_, { model }) => ({ model: { ...model, pings: model.pings + 1 } }),
    Read: ({ chosen }, { model }) => ({ model: { ...model, chosen } }),
  },
});

let owner: { readonly chosen: string | null; readonly pings: number } = {
  chosen: null,
  pings: 0,
};
let ping = () => {};

const OwnerView = View.make(OwnerLive, ({ model, children, send }) => {
  owner = model;
  ping = () => send({ _tag: 'Ping' });
  const opener = useRef<((how: 'keys' | 'touch') => void) | null>(null);
  return (
    <Opener value={opener}>
      <keys.Provider vim>
        <Page />
        <MicrophonePickerView instance={children.microphones} />
      </keys.Provider>
    </Opener>
  );
});

function Page() {
  const page = keys.useFocusSpot('content', 'page', { default: true });
  const opener = use(Opener);
  keys.useAction('app.microphone', () => opener?.current?.('keys'));
  return (
    <keys.Surface id="content">
      <div ref={page} tabIndex={-1} data-testid="page" />
    </keys.Surface>
  );
}

let apps = 0;
let root: ReactRoot | undefined;

const flush = () => act(() => new Promise((done) => setTimeout(done, 0)));
const search = () => document.querySelector<HTMLInputElement>('[cmdk-input]');
/** The rows, each its label and hint, a check for the one chosen. */
const rows = () =>
  [...document.querySelectorAll<HTMLElement>('[cmdk-item]')].map(
    (item) =>
      `${item.dataset['checked'] === 'true' ? '✓ ' : ''}${[
        ...item.querySelectorAll('span'),
      ]
        .filter((span) => span.children.length === 0)
        .map(({ textContent }) => textContent)
        .filter((text) => text !== '')
        .join(' · ')}`,
  );

const key = async (name: string, code: string) => {
  const target = document.activeElement ?? document.body;
  await act(async () => {
    target.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: name,
        code,
        bubbles: true,
        cancelable: true,
      }),
    );
    target.dispatchEvent(
      new KeyboardEvent('keyup', { key: name, code, bubbles: true }),
    );
  });
  await flush();
};

const settle = async () => {
  for (let at = 0; at < 5; at++) await flush();
};

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {};
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

beforeEach(async () => {
  media = new Media();
  Object.defineProperty(navigator, 'mediaDevices', {
    value: media,
    configurable: true,
  });
  const App = View.app(OwnerView, {
    layer: Layer.mergeAll(preferencesMemory(), recorder),
    name: `microphone-picker-test-${apps++}`,
  });
  root = createRoot(document.body.appendChild(document.createElement('div')));
  await act(async () => root!.render(<App />));
  for (let tries = 0; tries < 50 && owner.pings === 0; tries++) {
    await act(async () => ping());
    await flush();
  }
  await act(async () =>
    document.querySelector<HTMLElement>('[data-testid="page"]')!.focus(),
  );
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
});

describe('the Microphone Picker', () => {
  it('opens on `d`, asks to use the microphone so the names show, and lists the system default first', async () => {
    await key('d', 'KeyD');
    await settle();
    expect(document.activeElement).toBe(search());
    expect(media.asked).toBe(1);
    expect(media.stopped).toBe(1);
    expect(rows()).toEqual([
      '✓ System default · Default - MacBook Pro Microphone',
      'MacBook Pro Microphone',
      'Yeti',
    ]);
  });

  it('asks nothing when the names already show', async () => {
    media.allowed = true;
    await key('d', 'KeyD');
    await settle();
    expect(media.asked).toBe(0);
    expect(rows()).toHaveLength(3);
  });

  it('keeps the one chosen in Preferences, and checks it next time', async () => {
    await key('d', 'KeyD');
    await settle();
    await key('ArrowDown', 'ArrowDown');
    await key('ArrowDown', 'ArrowDown');
    await key('Enter', 'Enter');
    await settle();
    expect(search()).toBeNull();
    expect(owner.chosen).toBe('usb');
    await key('d', 'KeyD');
    await settle();
    expect(rows()).toEqual([
      'System default · Default - MacBook Pro Microphone',
      'MacBook Pro Microphone',
      '✓ Yeti',
    ]);
  });

  it('shows one plugged in while it is open', async () => {
    await key('d', 'KeyD');
    await settle();
    media.devices = [...media.devices, device('desk', 'Desk mic')];
    await act(async () => void media.dispatchEvent(new Event('devicechange')));
    await settle();
    expect(rows().at(-1)).toBe('Desk mic');
  });

  it('says why when the site may not use a microphone', async () => {
    media.getUserMedia = async () => {
      throw Object.assign(new Error('Denied'), { name: 'NotAllowedError' });
    };
    await key('d', 'KeyD');
    await settle();
    expect(document.querySelector('[cmdk-empty]')?.textContent).toBe(
      'The microphone is blocked for this site',
    );
  });
});
