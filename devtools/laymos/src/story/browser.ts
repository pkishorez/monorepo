import { Effect } from 'effect';

import type { Gesture } from './gesture.js';
import type { DeviceKind } from './schema/index.js';

export interface Browser {
  /** Opens a new Device (own storage) with its first Tab. */
  readonly open: (device?: DeviceKind, name?: string) => Effect.Effect<Tab>;
}

export interface Device {
  readonly kind: DeviceKind;
  /** Opens another Tab on this Device: same storage, same origin. */
  readonly open: (name?: string) => Effect.Effect<Tab>;
}

export interface Tab {
  readonly name: string;
  readonly device: Device;
  readonly click: (name: string, target: string) => Effect.Effect<void>;
  readonly type: (
    name: string,
    target: string,
    text: string,
  ) => Effect.Effect<void>;
  /** Playwright key names, pressed in order: `'Meta+K'`, `'g'`, `'g'`. */
  readonly press: (name: string, ...keys: string[]) => Effect.Effect<void>;
  readonly scroll: (
    name: string,
    to: string | { readonly y: number },
  ) => Effect.Effect<void>;
  readonly gesture: (name: string, gesture: Gesture) => Effect.Effect<void>;
  readonly waitFor: (name: string, target: string) => Effect.Effect<void>;
  readonly screenshot: (name: string) => Effect.Effect<void>;
  /** Escape hatch to the Playwright page; reported as an unanimated Step. */
  readonly raw: <R>(
    name: string,
    run: (page: unknown) => Promise<R>,
  ) => Effect.Effect<R>;
  readonly text: (target: string) => Effect.Effect<string>;
  readonly count: (target: string) => Effect.Effect<number>;
  readonly evaluate: <R>(fn: () => R) => Effect.Effect<R>;
  /** Closes the page; its Recording ends here. */
  readonly close: (name: string) => Effect.Effect<void>;
}

/** One Step the runner performs, as plain data. */
export type StepRequest =
  | { readonly kind: 'click'; readonly name: string; readonly target: string }
  | {
      readonly kind: 'type';
      readonly name: string;
      readonly target: string;
      readonly text: string;
    }
  | {
      readonly kind: 'press';
      readonly name: string;
      readonly keys: readonly string[];
    }
  | {
      readonly kind: 'scroll';
      readonly name: string;
      readonly to: string | { readonly y: number };
    }
  | {
      readonly kind: 'gesture';
      readonly name: string;
      readonly gesture: Gesture;
    }
  | { readonly kind: 'wait'; readonly name: string; readonly target: string }
  | { readonly kind: 'screenshot'; readonly name: string }
  | {
      readonly kind: 'raw';
      readonly name: string;
      readonly run: (page: unknown) => Promise<unknown>;
    }
  | { readonly kind: 'close'; readonly name: string };

/** The runner's side of the Browser Venue: plain promises, never Effects. */
export interface BrowserHost {
  readonly open: (device: DeviceKind, tab: string) => Promise<TabHost>;
}

export interface DeviceHost {
  readonly name: string;
  readonly kind: DeviceKind;
  readonly open: (tab: string) => Promise<TabHost>;
}

export interface TabHost {
  readonly name: string;
  readonly device: DeviceHost;
  readonly step: (request: StepRequest) => Promise<unknown>;
  readonly text: (target: string) => Promise<string>;
  readonly count: (target: string) => Promise<number>;
  readonly evaluate: (fn: () => unknown) => Promise<unknown>;
}

export function makeBrowser(host: BrowserHost): Browser {
  let opened = 0;
  const devices = new WeakMap<DeviceHost, Device>();

  const openTab = (
    name: string | undefined,
    open: (tab: string) => Promise<TabHost>,
  ) => {
    opened += 1;
    const tab = name ?? `Tab ${opened}`;
    return Effect.promise(() => open(tab)).pipe(
      Effect.map(toTab),
      Effect.withSpan(`Open ${tab}`, {
        attributes: { 'laymos.step': 'open', 'laymos.tab': tab },
      }),
    );
  };

  const toDevice = (device: DeviceHost): Device => {
    const known = devices.get(device);
    if (known !== undefined) return known;
    const made = evidence<Device>(
      { kind: device.kind, open: (name) => openTab(name, device.open) },
      { device: device.name, kind: device.kind },
    );
    devices.set(device, made);
    return made;
  };

  const toTab = (tab: TabHost): Tab => {
    const step = (request: StepRequest) =>
      Effect.promise(() => tab.step(request)).pipe(
        Effect.withSpan(request.name, {
          attributes: { 'laymos.step': request.kind, 'laymos.tab': tab.name },
        }),
      );
    return evidence<Tab>(
      {
        name: tab.name,
        device: toDevice(tab.device),
        click: (name, target) =>
          Effect.asVoid(step({ kind: 'click', name, target })),
        type: (name, target, text) =>
          Effect.asVoid(step({ kind: 'type', name, target, text })),
        press: (name, ...keys) =>
          Effect.asVoid(step({ kind: 'press', name, keys })),
        scroll: (name, to) => Effect.asVoid(step({ kind: 'scroll', name, to })),
        gesture: (name, gesture) =>
          Effect.asVoid(step({ kind: 'gesture', name, gesture })),
        waitFor: (name, target) =>
          Effect.asVoid(step({ kind: 'wait', name, target })),
        screenshot: (name) => Effect.asVoid(step({ kind: 'screenshot', name })),
        raw: <R>(name: string, run: (page: unknown) => Promise<R>) =>
          step({ kind: 'raw', name, run }) as Effect.Effect<R>,
        text: (target) => Effect.promise(() => tab.text(target)),
        count: (target) => Effect.promise(() => tab.count(target)),
        evaluate: <R>(fn: () => R) =>
          Effect.promise(() => tab.evaluate(fn)) as Effect.Effect<R>,
        close: (name) => Effect.asVoid(step({ kind: 'close', name })),
      },
      { tab: tab.name, device: tab.device.name },
    );
  };

  return evidence<Browser>(
    {
      open: (device = 'desktop', name) =>
        openTab(name, (tab) => host.open(device, tab)),
    },
    { browser: 'Chromium' },
  );
}

/** What a phase value shows in Evidence when it holds this object: a compact marker, not its methods. */
function evidence<A extends object>(value: A, json: object): A {
  return Object.defineProperty(value, 'toJSON', { value: () => json });
}
