import { afterEach, describe, expect, it, vi } from 'vitest';

// Both engines in US English, whatever this machine's language.
class BrowserNumberFormat extends Intl.NumberFormat {
  constructor(_?: Intl.LocalesArgument, options?: Intl.NumberFormatOptions) {
    super('en-US', options);
  }
}

// Hermes' Intl: it ignores `notation`, so compact money takes the hand path.
class HermesNumberFormat extends Intl.NumberFormat {
  constructor(_?: Intl.LocalesArgument, options?: Intl.NumberFormatOptions) {
    const { notation: __, ...rest } = options ?? {};
    super('en-US', rest);
  }
}

// A fresh copy of the module, so it checks its engine again.
const load = async (engine: 'browser' | 'hermes') => {
  vi.resetModules();
  vi.stubGlobal('Intl', {
    ...Intl,
    NumberFormat:
      engine === 'hermes' ? HermesNumberFormat : BrowserNumberFormat,
  });
  const { money } = await import('../money.ts');
  return (cents: number) => money(cents, 'USD', { compact: true });
};

afterEach(() => {
  vi.unstubAllGlobals();
});

const CASES: ReadonlyArray<readonly [number, string]> = [
  [0, '$0'],
  [450, '$4.5'],
  [14_445, '$144.5'],
  [-14_445, '-$144.5'],
  [14_444, '$144.4'],
  [99_995, '$1K'],
  [120_000, '$1.2K'],
  [125_000, '$1.3K'],
  [99_995_000, '$1M'],
  [250_000_000, '$2.5M'],
  [123_456_789_000, '$1.2B'],
];

describe('compact money', () => {
  it('rounds in whole cents, half away from zero, in a browser', async () => {
    const compact = await load('browser');
    for (const [cents, text] of CASES) expect(compact(cents)).toBe(text);
  });

  it('prints the same on Hermes, whose Intl has no compact notation', async () => {
    const compact = await load('hermes');
    for (const [cents, text] of CASES) expect(compact(cents)).toBe(text);
  });
});
