import { afterEach, describe, expect, it } from 'vitest';
import { resolveWebSocketUrl } from './protocol.ts';

const withLocation = (href: string | undefined) => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'location');
  Object.defineProperty(globalThis, 'location', {
    value: href === undefined ? undefined : { href },
    configurable: true,
    writable: true,
  });
  return () => {
    if (descriptor) Object.defineProperty(globalThis, 'location', descriptor);
    else delete (globalThis as { location?: unknown }).location;
  };
};

let restore: (() => void) | undefined;
afterEach(() => {
  restore?.();
  restore = undefined;
});

describe('resolveWebSocketUrl', () => {
  it('swaps https to wss for a relative url', () => {
    restore = withLocation('https://example.com/app');
    expect(resolveWebSocketUrl('/rpc/chat')).toBe('wss://example.com/rpc/chat');
  });

  it('swaps http to ws for a relative url', () => {
    restore = withLocation('http://localhost:5173/app');
    expect(resolveWebSocketUrl('/rpc')).toBe('ws://localhost:5173/rpc');
  });

  it('keeps the query but drops the hash from the resolved url', () => {
    restore = withLocation('https://example.com/app?a=1#top');
    expect(resolveWebSocketUrl('/rpc?b=2#frag')).toBe(
      'wss://example.com/rpc?b=2',
    );
  });

  it('passes an absolute ws url through untouched', () => {
    restore = withLocation('https://example.com/app');
    expect(resolveWebSocketUrl('ws://other.test/rpc')).toBe(
      'ws://other.test/rpc',
    );
    expect(resolveWebSocketUrl('wss://other.test/rpc')).toBe(
      'wss://other.test/rpc',
    );
  });

  it('swaps the scheme of an absolute http url', () => {
    restore = withLocation('https://example.com/app');
    expect(resolveWebSocketUrl('https://other.test/rpc')).toBe(
      'wss://other.test/rpc',
    );
  });

  it('resolves an absolute url with no location available', () => {
    restore = withLocation(undefined);
    expect(resolveWebSocketUrl('wss://other.test/rpc')).toBe(
      'wss://other.test/rpc',
    );
  });

  it('throws a descriptive error for a relative url with no location', () => {
    restore = withLocation(undefined);
    expect(() => resolveWebSocketUrl('/rpc')).toThrow(
      /no globalThis\.location/,
    );
  });
});
