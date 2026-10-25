import { handler } from '@kestack/kabuki/start/server';
import { describe, expect, it } from 'vitest';
import { memory } from '../../database/sqlite/memory/index.js';
import type { AuthWorkerConfig } from '../../service/config.js';
import {
  applyCookies,
  baseURL,
  config,
  post,
  postAsProgram,
  signIn,
} from '../../service/tests/fixture.js';
import { makeAuthWorker } from '../../service/service.js';
import app from '../app.tsx';
import server from '../loaders.server.ts';

/*
 * Test Users on the pages: the Login Screen offers Test Sign-In only when
 * the Auth Worker has it on, and every list of Accounts marks Test Users.
 */

const pages = handler({
  app,
  server,
  build: {
    id: undefined,
    base: '/',
    entry: { script: '/assets/entry.js', styles: [], preloads: [] },
    views: {},
    head: [],
  },
});

const make = (overrides: Partial<AuthWorkerConfig> = {}) =>
  makeAuthWorker(
    { ...config, database: memory(), ...overrides },
    {
      assets: {},
      fetch: (request, context) => pages.fetch(request, { env: context }),
    },
  );

type Worker = ReturnType<typeof make>;

const html = async (worker: Worker, path: string, cookie = '') =>
  (
    await worker.handler(
      new Request(`${baseURL}${path}`, { headers: cookie ? { cookie } : {} }),
    )
  ).text();

const signInAsTest = async (worker: Worker, email: string, cookie = '') =>
  applyCookies(
    cookie,
    await post(worker, '/test/sign-in', { email }, cookie ? { cookie } : {}),
  );

describe('the Login Screen with Test Users', () => {
  it('offers no Test Sign-In when it is off', async () => {
    const page = await html(make(), '/login');
    expect(page).toContain('Continue with Google');
    expect(page).not.toContain('Sign in as a test user');
    expect(page).not.toContain('name="email"');
  });

  it('asks for the email alone without a key', async () => {
    const page = await html(make({ testUsers: {} }), '/login');
    expect(page).toContain('Continue with Google');
    expect(page).toContain('Sign in as a test user');
    expect(page).toContain('name="email"');
    expect(page).not.toContain('name="key"');
  });

  it('asks for the key too when there is one', async () => {
    const page = await html(make({ testUsers: { key: 'sesame' } }), '/login');
    expect(page).toContain('name="email"');
    expect(page).toContain('name="key"');
    expect(page).not.toContain('sesame');
  });
});

describe('a Test User among the Accounts', () => {
  it('is marked Test on the Home Page; a real User is not', async () => {
    const worker = make({ testUsers: {} });
    const cookie = await signInAsTest(worker, 'ada@example.test');
    expect(await html(worker, '/', cookie)).toMatch(/>Test<\/span>/);
    const mary = await signIn(worker, 'mary@example.com');
    expect(await html(worker, '/', mary.active)).not.toMatch(/>Test<\/span>/);
  });

  it('is marked Test in the Approving Account picker', async () => {
    const worker = make({ testUsers: {} });
    let cookie = await signInAsTest(worker, 'ada@example.test');
    cookie = await signInAsTest(worker, 'grace@example.test', cookie);
    const { user_code } = (await (
      await postAsProgram(worker, '/device/code', { client_id: 'acme-cli' })
    ).json()) as { user_code: string };
    const page = await html(worker, `/device?code=${user_code}`, cookie);
    expect(page).toContain('ada@example.test');
    expect(page).toContain('grace@example.test');
    expect(page.match(/>Test<\/span>/g)?.length).toBe(2);
  });
});
