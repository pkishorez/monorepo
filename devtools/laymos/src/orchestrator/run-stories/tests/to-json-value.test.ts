import { describe, expect, test } from 'vitest';

import { toJsonValue } from '../to-json-value.js';

describe('toJsonValue', () => {
  test('drops function-valued properties instead of stringifying them', () => {
    expect(toJsonValue({ id: 1, save: () => 1 })).toEqual({ id: 1 });
  });

  test('uses an object’s own JSON form, as Tabs and Devices give', () => {
    const tab = Object.defineProperty({ click: () => {} }, 'toJSON', {
      value: () => ({ tab: 'Tab 1', device: 'Device 1' }),
    });
    expect(toJsonValue({ tab, at: new Date(0) })).toEqual({
      tab: { tab: 'Tab 1', device: 'Device 1' },
      at: '1970-01-01T00:00:00.000Z',
    });
  });
});
