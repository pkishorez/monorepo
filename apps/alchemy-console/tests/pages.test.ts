import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startConsole } from './support/console.ts';

/*
 * The first HTML the Worker sends is already the right screen, so the
 * browser never paints a "Checking…" in between.
 */

const ada = { id: 'local_ada', email: 'ada@demo', name: 'Ada Lovelace' };
const eve = { id: 'local_eve', email: 'eve@demo', name: 'Eve' };

let console_: Awaited<ReturnType<typeof startConsole>>;
beforeAll(async () => {
  console_ = await startConsole({ invites: 'ada@demo' });
});
afterAll(() => console_?.dispose());

const page = async (visitor?: typeof ada) => {
  const response = await console_.fetch('/', visitor);
  return { status: response.status, html: await response.text() };
};

describe('the first HTML', () => {
  it('is Welcome, filled in, for an invited member', async () => {
    const { status, html } = await page(ada);
    expect(status).toBe(200);
    expect(html).toContain('Welcome, <!-- -->Ada');
    expect(html).toContain('Connect GitHub');
    expect(html).toContain('aria-label="Account: Ada Lovelace"');
  });

  it('turns away a signed-in visitor who is not invited', async () => {
    const { html } = await page(eve);
    expect(html).toContain('Console is invite-only for now.');
    expect(html).not.toContain('Connect GitHub');
  });

  it('is the sign-in screen for a visitor nobody signed in', async () => {
    const { html } = await page();
    expect(html).toContain('Sign in to Console');
    expect(html).toContain('type="email"');
  });

  it('is never kept for another visitor', async () => {
    const response = await console_.fetch('/', ada);
    expect(response.headers.get('cache-control')).toContain('private');
  });
});
