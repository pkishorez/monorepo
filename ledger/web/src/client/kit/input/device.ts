import { useSyncExternalStore } from 'react';

/**
 * What this device can be driven by. A device may have both: a laptop with
 * a touch screen, an iPad with a keyboard.
 */
export type Device = {
  /** A keyboard, or a mouse that hovers, which nearly always has one. */
  readonly keyboard: boolean;
  /** A touch screen. */
  readonly touch: boolean;
};

const FINE = '(hover: hover) and (pointer: fine)';
const COARSE = '(any-pointer: coarse)';

/**
 * Marks `<html>` with `data-keyboard` and `data-touch` before the first
 * paint, so CSS shows the right hints without a flash. Inline it in the
 * document's head.
 */
export const DEVICE_SCRIPT = `(()=>{const h=document.documentElement;if(matchMedia('${FINE}').matches)h.dataset.keyboard='';if(matchMedia('${COARSE}').matches)h.dataset.touch=''})()`;

const SERVER: Device = { keyboard: false, touch: false };

let device: Device | undefined;
const listeners = new Set<() => void>();

const read = (): Device => {
  const html = document.documentElement;
  return {
    keyboard: 'keyboard' in html.dataset || matchMedia(FINE).matches,
    touch: matchMedia(COARSE).matches,
  };
};

const write = (next: Device) => {
  const html = document.documentElement;
  html.toggleAttribute('data-keyboard', next.keyboard);
  html.toggleAttribute('data-touch', next.touch);
  if (device?.keyboard === next.keyboard && device.touch === next.touch) return;
  device = next;
  for (const listener of listeners) listener();
};

const editable = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

// A key pressed outside a text field is a real keyboard: an on-screen one
// only types into fields. Once seen, it stays for the visit.
const onKey = (event: KeyboardEvent) => {
  if (device?.keyboard || editable(event.target)) return;
  write({ ...read(), keyboard: true });
};

const onMedia = () => write(read());

const subscribe = (listener: () => void) => {
  if (listeners.size === 0) {
    write(read());
    window.addEventListener('keydown', onKey, true);
    matchMedia(FINE).addEventListener('change', onMedia);
    matchMedia(COARSE).addEventListener('change', onMedia);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    window.removeEventListener('keydown', onKey, true);
    matchMedia(FINE).removeEventListener('change', onMedia);
    matchMedia(COARSE).removeEventListener('change', onMedia);
  };
};

/** What this device can be driven by, live. */
export const useDevice = () =>
  useSyncExternalStore(
    subscribe,
    () => (device ??= read()),
    () => SERVER,
  );
