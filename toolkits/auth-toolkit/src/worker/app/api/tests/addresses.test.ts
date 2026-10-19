import { describe, expect, it } from 'vitest';
import {
  deviceHref,
  loginHref,
  returnDestination,
  signedOAuthQuery,
} from '../addresses.ts';

describe('returnDestination', () => {
  it('keeps a path on this origin', () => {
    expect(returnDestination('/device?code=ABCD')).toBe('/device?code=ABCD');
  });

  it.each([
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    '',
    // A browser drops tabs and newlines, leaving `//evil.example`.
    '/\t/evil.example',
    '/\n/evil.example',
    '/\r/evil.example',
    ' //evil.example',
    '/\u0000/evil.example',
    '/x\\..\\evil',
  ])('refuses %j, going home instead', (value) =>
    expect(returnDestination(value)).toBe('/'),
  );

  it('normalizes a path to the one a browser would follow', () => {
    expect(returnDestination('/a/../device?code=1#x')).toBe('/device?code=1#x');
  });
});

describe('returnDestination for an app under the Shared Cookie Domain', () => {
  const trust = {
    cookieDomain: 'example.com',
    origin: 'https://auth.example.com',
  };

  it.each([
    'https://app.example.com/notes?id=1#top',
    'https://example.com/',
    'https://deep.app.example.com/x',
  ])('goes back to %j', (value) =>
    expect(returnDestination(value, trust)).toBe(value),
  );

  it.each([
    'https://evil.example/',
    'https://example.com.evil.example/',
    'https://evilexample.com/',
    'http://app.example.com/',
    'javascript:alert(1)',
    'https://user:pass@app.example.com/',
    'https://app.example.com\t.evil.example/',
    'https://evil.example\\@app.example.com/',
  ])('refuses %j', (value) =>
    expect(returnDestination(value, trust)).toBe('/'),
  );

  it('allows http when the Auth Worker itself runs on http', () => {
    expect(
      returnDestination('http://app.acme.localhost:3000/', {
        cookieDomain: 'acme.localhost',
        origin: 'http://auth.acme.localhost:8787',
      }),
    ).toBe('http://app.acme.localhost:3000/');
  });

  it('is kept by the Login Screen link', () => {
    expect(loginHref('https://app.example.com/notes', false, trust)).toBe(
      '/login?return_to=https%3A%2F%2Fapp.example.com%2Fnotes',
    );
  });
});

describe('loginHref', () => {
  it('returns to where it was asked from, and says when adding', () => {
    expect(loginHref('/consent?x=1', true)).toBe(
      '/login?add_account=1&return_to=%2Fconsent%3Fx%3D1',
    );
  });

  it('leaves out a return home', () => {
    expect(loginHref('/')).toBe('/login');
  });
});

it('deviceHref carries the code and the hinted Account', () => {
  expect(deviceHref('ABCD1234', 'ada@acme.dev')).toBe(
    '/device?code=ABCD1234&account=ada%40acme.dev',
  );
});

describe('signedOAuthQuery', () => {
  it('keeps only the signed parameters', () => {
    const search =
      '?client_id=c&scope=openid&ba_param=client_id&ba_param=scope&sig=s&return_to=%2F';
    expect(signedOAuthQuery(search)).toBe(
      'client_id=c&scope=openid&ba_param=client_id&ba_param=scope&sig=s',
    );
  });

  it('is undefined without a signature', () => {
    expect(signedOAuthQuery('?client_id=c')).toBeUndefined();
  });
});
