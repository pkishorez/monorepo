import { describe, expect, it } from 'vitest';
import { nameOf } from '../index.ts';

describe('nameOf', () => {
  it('lowercases letters, whatever Shift or Caps Lock did', () => {
    expect(nameOf({ key: 'k', code: 'KeyK' })).toBe('k');
    expect(nameOf({ key: 'K', code: 'KeyK' })).toBe('k');
  });

  it('uses the letter of the physical key when the layout types another', () => {
    expect(nameOf({ key: 'л', code: 'KeyK' })).toBe('k');
    expect(nameOf({ key: '˚', code: 'KeyK' })).toBe('k');
    expect(nameOf({ key: 'Dead', code: 'KeyE' })).toBe('e');
  });

  it('keeps the letter a layout types on another key', () => {
    expect(nameOf({ key: 'a', code: 'KeyQ' })).toBe('a');
  });

  it('keeps digits and symbols as typed', () => {
    expect(nameOf({ key: '?', code: 'Slash' })).toBe('?');
    expect(nameOf({ key: '1', code: 'Digit1' })).toBe('1');
    expect(nameOf({ key: '&', code: 'Digit1' })).toBe('&');
  });

  it('names other keys', () => {
    expect(nameOf({ key: ' ', code: 'Space' })).toBe('Space');
    expect(nameOf({ key: 'Enter', code: 'Enter' })).toBe('Enter');
    expect(nameOf({ key: 'Shift', code: 'ShiftRight' })).toBe('Shift');
    expect(nameOf({ key: 'OS', code: 'MetaLeft' })).toBe('Meta');
    expect(nameOf({ key: 'Unidentified', code: 'F13' })).toBe('F13');
  });
});
