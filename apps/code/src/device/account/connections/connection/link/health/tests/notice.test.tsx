// @vitest-environment jsdom
import type { Connection as ConnectionSchema } from '@kestack/connect/cloud';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectionNotice, noticePillOf, retryIn } from '../notice.tsx';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/*
 * What the app says of a Connection's code Plugin and its `ke-connect`:
 * Updating with how far, the Plugin stopped with its last lines to read and
 * copy, and how to update an older `ke-connect`; nothing while all is well.
 */

type Connection = typeof ConnectionSchema.Type;

const NOW = 1_000_000;
const HASH = 'a'.repeat(64);

const connection = (
  plugins: Connection['plugins'],
  version = '0.0.5',
  minConnect: string | null = '0.0.5',
): Connection => ({
  id: 'm1',
  name: 'Laptop',
  key: 'k',
  version,
  status: { _tag: 'Reachable', url: 'https://a.example', at: NOW },
  lastSeen: NOW,
  plugins,
  wanted: {},
  minConnect,
});

const updating = connection({
  code: {
    _tag: 'Downloading',
    hash: HASH,
    received: 1_500_000,
    total: 3_000_000,
  },
});
const crashed = connection({
  code: {
    _tag: 'Crashed',
    hash: HASH,
    log: ['Error: boom', '    at main (code.mjs:1:1)'],
    retryAt: NOW + 12_000,
  },
});
const older = connection({ code: { _tag: 'Running', hash: HASH } }, '0.0.4');

describe('the notice pill', () => {
  it('says Connect is Updating, with how far it downloaded', () => {
    expect(noticePillOf(updating, NOW)?.[0]).toBe('Updating Connect… 50%');
    expect(
      noticePillOf(
        connection({ code: { _tag: 'Starting', hash: HASH } }),
        NOW,
      )?.[0],
    ).toBe('Updating Connect…');
  });

  it('says the code Plugin stopped, and when it is tried again', () => {
    const [label, title, tone] = noticePillOf(crashed, NOW)!;
    expect(label).toBe('The code Plugin stopped');
    expect(title).toContain('trying again in 12 s');
    expect(tone).toBe('bg-destructive');
    expect(retryIn(NOW - 1, NOW)).toBe('now');
  });

  it('asks to update an older ke-connect, with the command', () => {
    const [label, title] = noticePillOf(older, NOW)!;
    expect(label).toBe('Update ke-connect');
    expect(title).toContain('npm i -g @kestack/connect@latest');
  });

  it('says nothing while the Plugin runs on the latest ke-connect', () => {
    expect(
      noticePillOf(connection({ code: { _tag: 'Running', hash: HASH } }), NOW),
    ).toBeNull();
    expect(noticePillOf(null, NOW)).toBeNull();
  });
});

describe('the notice in Settings', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  const render = (shown: Connection) =>
    act(() => root.render(<ConnectionNotice connection={shown} now={NOW} />));

  it('shows the update’s progress', () => {
    render(updating);
    expect(host.textContent).toContain('Updating Connect: 1.5 MB of 3.0 MB');
    expect(host.querySelector('[role="progressbar"]')).not.toBeNull();
  });

  it('shows the Plugin stopped, its last lines behind a fold, and copies them', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });
    render(crashed);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      'The code Plugin stopped; trying again in 12 s.',
    );
    expect(host.querySelector('summary')?.textContent).toBe('Its last 2 lines');
    expect(host.querySelector('pre')?.textContent).toBe(
      'Error: boom\n    at main (code.mjs:1:1)',
    );
    await act(async () => {
      host
        .querySelector<HTMLButtonElement>('[aria-label="Copy its last lines"]')!
        .click();
    });
    expect(writeText).toHaveBeenCalledWith(
      'Error: boom\n    at main (code.mjs:1:1)',
    );
    expect(host.textContent).toContain('Copied');
  });

  it('shows how to update an older ke-connect', () => {
    render(older);
    expect(host.textContent).toContain(
      'this Connection runs 0.0.4, and 0.0.5 is out',
    );
    expect(host.querySelector('code')?.textContent).toBe(
      'npm i -g @kestack/connect@latest',
    );
  });

  it('shows nothing while all is well', () => {
    render(connection({ code: { _tag: 'Running', hash: HASH } }));
    expect(host.innerHTML).toBe('');
  });
});
