import { describe, expect, it } from 'vitest';
import { grouped, isLocalEnvironment } from '../index.ts';

const session = (app: string, environment: string, name: string) => ({
  app,
  environment,
  name,
});

describe('isLocalEnvironment', () => {
  it('is a host on this computer, with or without its port', () => {
    expect(isLocalEnvironment('localhost:5173')).toBe(true);
    expect(isLocalEnvironment('127.0.0.1')).toBe(true);
    expect(isLocalEnvironment('code.kishore.localhost:1355')).toBe(true);
    expect(isLocalEnvironment('app.trycloudflare.com')).toBe(false);
    expect(isLocalEnvironment('default')).toBe(false);
  });
});

describe('grouped', () => {
  it('groups by app A to Z, then Environment, this computer first, each keeping its order', () => {
    expect(
      grouped([
        session('code', 'app.trycloudflare.com', 'calm-heron'),
        session('connect', 'kishores-mbp', 'swift-seal'),
        session('code', 'localhost:5173', 'quiet-otter'),
        session('code', 'localhost:5173', 'brave-lynx'),
      ]),
    ).toEqual([
      {
        app: 'code',
        environments: [
          {
            environment: 'localhost:5173',
            sessions: [
              session('code', 'localhost:5173', 'quiet-otter'),
              session('code', 'localhost:5173', 'brave-lynx'),
            ],
          },
          {
            environment: 'app.trycloudflare.com',
            sessions: [session('code', 'app.trycloudflare.com', 'calm-heron')],
          },
        ],
      },
      {
        app: 'connect',
        environments: [
          {
            environment: 'kishores-mbp',
            sessions: [session('connect', 'kishores-mbp', 'swift-seal')],
          },
        ],
      },
    ]);
  });

  it('is none for none', () => {
    expect(grouped([])).toEqual([]);
  });
});
