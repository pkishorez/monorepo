import { describe, expect, it } from 'vitest';
import { signInName } from '../sign-in-name.js';

describe('signInName', () => {
  it.each([
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
      'Chrome on macOS',
    ],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
      'Safari on macOS',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      'Safari on iOS',
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0',
      'Edge on Windows',
    ],
    [
      'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0',
      'Firefox on Linux',
    ],
    [
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
      'Chrome on Android',
    ],
  ])('names a browser: %s', (agent, name) => {
    expect(signInName(agent)).toEqual({ name, kind: 'browser' });
  });

  it.each([
    ['acme-cli/1.4.0 (laptop)', 'acme-cli on laptop'],
    ['acme-cli/1.4.0 (Ada’s MacBook Pro)', 'acme-cli on Ada’s MacBook Pro'],
    ['acme-cli/1.4.0', 'acme-cli'],
  ])('names a Device: %s', (agent, name) => {
    expect(signInName(agent)).toEqual({ name, kind: 'device' });
  });

  it.each([null, undefined, '', '   ', 'something odd'])(
    'falls back for %j',
    (agent) => {
      expect(signInName(agent)).toEqual({
        name: 'Unknown device',
        kind: 'unknown',
      });
    },
  );
});
