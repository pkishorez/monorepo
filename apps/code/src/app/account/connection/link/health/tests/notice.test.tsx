// @vitest-environment jsdom
import type { Connection as ConnectionSchema } from '@kestack/connect/cloud';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConnectionNotice, noticePillOf } from '../notice.tsx';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/*
 * What the app says of a Connection's code Plugin and its `ke-connect`:
 * Updating, Code moving to its newest build, and how to update an older
 * `ke-connect`; nothing while all is well.
 */

type Connection = typeof ConnectionSchema.Type;

const NOW = 1_000_000;

const connection = (
  version = '0.0.5',
  minConnect: string | null = '0.0.5',
): Connection => ({
  id: 'm1',
  name: 'Laptop',
  key: 'k',
  version,
  status: { _tag: 'Reachable', url: 'https://a.example', at: NOW },
  lastSeen: NOW,
  wanted: {},
  minConnect,
  displayName: null,
});

const older = connection('0.0.4');

describe('the notice pill', () => {
  it('asks to update an Outdated ke-connect, with the command', () => {
    const [label, title] = noticePillOf(older)!;
    expect(label).toBe('Update ke-connect');
    expect(title).toBe(
      'ke-connect 0.0.4 is older than Connect Cloud accepts; run `npm i -g @kestack/connect@latest` on it, then start it again.',
    );
    // At the Minimum Connect, or with none named, it is not Outdated.
    expect(noticePillOf(connection('0.0.4', null))).toBeNull();
  });

  it('says the Connection is Updating while its socket says it runs an older Release', () => {
    expect(noticePillOf(connection(), 'Updating')?.[0]).toBe(
      'Updating Connect…',
    );
  });

  it('says Code is updating when it is the older side', () => {
    expect(noticePillOf(connection(), 'Stale')?.[0]).toBe('Updating Code…');
  });

  it('says nothing while all is well', () => {
    expect(noticePillOf(connection())).toBeNull();
    expect(noticePillOf(null)).toBeNull();
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

  const render = (shown: Connection, behind: 'Updating' | null = null) =>
    act(() =>
      root.render(<ConnectionNotice connection={shown} behind={behind} />),
    );

  it('says the Connection is Updating', () => {
    render(connection(), 'Updating');
    expect(host.textContent).toContain('Updating Connect');
  });

  it('shows how to update an Outdated ke-connect', () => {
    render(older);
    expect(host.textContent).toContain(
      'ke-connect 0.0.4 is older than Connect Cloud accepts; run this on it',
    );
    expect(host.querySelector('code')?.textContent).toBe(
      'npm i -g @kestack/connect@latest',
    );
  });

  it('shows nothing while all is well', () => {
    render(connection());
    expect(host.innerHTML).toBe('');
  });
});
