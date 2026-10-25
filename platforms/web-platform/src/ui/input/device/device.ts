import { useSyncExternalStore } from 'react';

/**
 * What this device can be driven by. A device may have both: a laptop with
 * a touch screen, an iPad with a keyboard.
 */
export type Device = {
  /**
   * Driven by keys: a key pressed outside a field since the last touch, or,
   * with no touch screen at all, a mouse that hovers, which nearly always
   * has a keyboard beside it. A touch screen is touch until keys are used.
   */
  readonly keyboard: boolean;
  /** A touch screen, as the media queries or the browser say, or a touch seen. */
  readonly touch: boolean;
};

const FINE = '(hover: hover) and (pointer: fine)';
const COARSE = '(any-pointer: coarse)';

/**
 * Marks `<html>` with `data-keyboard` and `data-touch` before the first
 * paint, so CSS shows the right hints without a flash, and keeps
 * `data-input` on the input last used: `touch` (a pen too), `mouse` or
 * `keys`. In a field, a character typed is not the keys, as an on-screen
 * keyboard types there too; a chord with Cmd, Ctrl or Alt, or a key that
 * names itself, such as Escape, Tab or an arrow, is. Backspace and Enter
 * are left as typing, as are the keys an on-screen keyboard sends while it
 * composes. CSS draws no focus ring while it is `touch`. Inline it in the
 * document's head.
 */
export const DEVICE_SCRIPT = `(()=>{const h=document.documentElement,f=matchMedia('${FINE}').matches,c=matchMedia('${COARSE}').matches||navigator.maxTouchPoints>0;if(f&&!c)h.dataset.keyboard='';if(c)h.dataset.touch='';if(c)h.dataset.input='touch';addEventListener('pointerdown',e=>{h.dataset.input=e.pointerType==='mouse'?'mouse':'touch';if(e.pointerType==='touch'||e.pointerType==='pen'){h.dataset.touch='';delete h.dataset.keyboard}},true);addEventListener('keydown',e=>{const t=e.target,typed=t instanceof HTMLElement&&(t.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));if(!typed||e.metaKey||e.ctrlKey||e.altKey||(e.key.length>1&&!/^(Unidentified|Process|Dead|Backspace|Enter|Shift|CapsLock)$/.test(e.key)))h.dataset.input='keys'},true)})()`;

const SERVER: Device = { keyboard: false, touch: false };

let device: Device | undefined;
const listeners = new Set<() => void>();

// `<html>` keeps what was seen: `data-keyboard` a key pressed outside a
// field since the last touch, `data-touch` a touch, whatever the media
// queries say, as in an emulator.
const read = (): Device => {
  const html = document.documentElement;
  const touch =
    'touch' in html.dataset ||
    matchMedia(COARSE).matches ||
    navigator.maxTouchPoints > 0;
  return {
    keyboard:
      'keyboard' in html.dataset || (!touch && matchMedia(FINE).matches),
    touch,
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
// only types into fields. It stays until the screen is touched again.
const onKey = (event: KeyboardEvent) => {
  if (device?.keyboard || editable(event.target)) return;
  write({ ...read(), keyboard: true });
};

// A touch, or a pen, makes it touch again; a mouse, or a pointer that
// does not say, changes nothing.
const onPointer = (event: PointerEvent) => {
  if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
  if (device?.touch && !device.keyboard) return;
  write({ keyboard: false, touch: true });
};

const onMedia = () => write(read());

const subscribe = (listener: () => void) => {
  if (listeners.size === 0) {
    write(read());
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onPointer, true);
    matchMedia(FINE).addEventListener('change', onMedia);
    matchMedia(COARSE).addEventListener('change', onMedia);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('pointerdown', onPointer, true);
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
