import { describe, expect, it } from 'vitest';

import { returnDestination, routeFor } from '../route.js';

const at = (url: string) => {
  const { pathname, search } = new URL(url, 'https://auth.example.com');
  return { pathname, search };
};

describe('routeFor', () => {
  it('waits while the session is unknown, on every screen', () => {
    for (const screen of ['home', 'login', 'consent', 'device'] as const) {
      expect(routeFor(screen, 'unknown', at('/'))).toEqual({ kind: 'wait' });
    }
  });

  it('sends a signed-out visitor from the Home Page to the Login Screen', () => {
    expect(routeFor('home', 'signed-out', at('/'))).toEqual({
      kind: 'go',
      to: '/login',
    });
    expect(routeFor('home', 'signed-in', at('/'))).toEqual({ kind: 'show' });
  });

  it('sends a signed-out visitor to sign in and back, keeping the query', () => {
    const route = routeFor('device', 'signed-out', at('/device?user_code=AB'));
    expect(route).toEqual({
      kind: 'go',
      to: '/login?return_to=%2Fdevice%3Fuser_code%3DAB',
    });
    expect(routeFor('consent', 'signed-in', at('/consent'))).toEqual({
      kind: 'show',
    });
  });

  it('sends a signed-in User away from the Login Screen, back where they came from', () => {
    expect(routeFor('login', 'signed-in', at('/login'))).toEqual({
      kind: 'go',
      to: '/',
    });
    expect(
      routeFor(
        'login',
        'signed-in',
        at('/login?return_to=%2Fdevice%3Fuser_code%3DAB'),
      ),
    ).toEqual({ kind: 'go', to: '/device?user_code=AB' });
    expect(routeFor('login', 'signed-out', at('/login'))).toEqual({
      kind: 'show',
    });
  });

  it('keeps a signed-in User on the Login Screen during a Third-Party authorization', () => {
    expect(
      routeFor('login', 'signed-in', at('/login?client_id=notes&sig=x')),
    ).toEqual({ kind: 'show' });
  });
});

describe('returnDestination', () => {
  it('only returns to paths on this origin', () => {
    expect(returnDestination('?return_to=%2Fdevice')).toBe('/device');
    expect(returnDestination('?return_to=https%3A%2F%2Fevil.dev')).toBe('/');
    expect(returnDestination('?return_to=%2F%2Fevil.dev')).toBe('/');
    expect(returnDestination('?return_to=%2F%5Cevil.dev')).toBe('/');
    expect(returnDestination('')).toBe('/');
  });
});
