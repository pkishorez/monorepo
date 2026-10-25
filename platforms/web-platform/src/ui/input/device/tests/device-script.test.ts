// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DEVICE_SCRIPT } from '../device.ts';

/*
 * The input last used, as DEVICE_SCRIPT keeps it on `<html>`: a key typed
 * into a field is the keys only when it cannot be an on-screen keyboard's,
 * a chord or a named key; a character, Backspace or Enter stays a touch.
 * Neither ever marks the device as having a keyboard.
 */

const html = document.documentElement;
let field: HTMLInputElement;

const press = (target: EventTarget, init: KeyboardEventInit) =>
  target.dispatchEvent(
    new KeyboardEvent('keydown', { bubbles: true, ...init }),
  );

const tap = () => {
  const event = new MouseEvent('pointerdown', { bubbles: true });
  Object.assign(event, { pointerType: 'touch' });
  field.dispatchEvent(event);
};

beforeAll(() => {
  window.matchMedia = (query: string) =>
    ({ matches: query.includes('coarse'), media: query }) as MediaQueryList;
  // As the document's head runs it, once.
  new Function(DEVICE_SCRIPT)();
});

beforeEach(() => {
  document.body.innerHTML = '<input aria-label="Field" />';
  field = document.querySelector('input')!;
  tap();
});

describe('DEVICE_SCRIPT', () => {
  it('starts as a touch on a device with only a touch screen', () => {
    expect(html.dataset['input']).toBe('touch');
    expect('keyboard' in html.dataset).toBe(false);
  });

  it('keeps a touch while characters, Backspace and Enter are typed into a field', () => {
    for (const key of ['a', '/', ' ', 'Backspace', 'Enter', 'Unidentified'])
      press(field, { key });
    expect(html.dataset['input']).toBe('touch');
    expect('keyboard' in html.dataset).toBe(false);
  });

  it('takes a chord or a named key in a field for the keys', () => {
    for (const init of [
      { key: 'k', metaKey: true },
      { key: 'a', ctrlKey: true },
      { key: 'x', altKey: true },
      { key: 'Escape' },
      { key: 'ArrowDown' },
      { key: 'Tab' },
    ]) {
      tap();
      press(field, init);
      expect(html.dataset['input']).toBe('keys');
    }
    expect('keyboard' in html.dataset).toBe(false);
  });

  it('takes any key outside a field for the keys', () => {
    press(document.body, { key: 'a' });
    expect(html.dataset['input']).toBe('keys');
  });
});
