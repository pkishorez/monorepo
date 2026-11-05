// @vitest-environment jsdom
import type { Connection as ConnectionSchema } from '@kestack/connect/cloud';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Links, nameOf } from '../../../../../connection/link/index.ts';
import { ConnectionHeader } from '../header.tsx';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/*
 * The sidebar's top names a Connection by its Display Name alone, as the
 * sidebar is handed it (`nameOf`); the Connections it opens say each one's
 * Computer Name as well, once it has a Display Name, so two of one Display
 * Name are told apart.
 */

type Connection = typeof ConnectionSchema.Type;

const record = (
  id: string,
  name: string,
  displayName: string | null,
): Connection => ({
  id,
  name,
  key: `key-${id}`,
  version: '0.0.6',
  status: { _tag: 'Reachable', url: `https://${id}.example`, at: 0 },
  lastSeen: Date.now(),
  wanted: {},
  minConnect: null,
  displayName,
});

const RECORDS = [
  record('m1', 'Ada-MacBook', 'Work'),
  record('m2', 'Ada-Mini (studio)', 'Work'),
  record('m3', 'Ada-iMac (home)', null),
];

let host: HTMLDivElement;
let root: Root;

const render = (shown: string | null) =>
  act(() =>
    root.render(
      <Links
        value={{
          connections: RECORDS,
          status: { m1: 'linked', m2: 'linked', m3: 'linked' },
          checked: true,
        }}
      >
        <ConnectionHeader
          read
          connections={RECORDS.map((each) => ({
            id: each.id,
            name: nameOf(each),
          }))}
          shown={shown}
          sessions={[]}
          projects={[]}
          onChoose={() => {}}
          onReload={() => {}}
        />
      </Links>,
    ),
  );

const title = () =>
  host.querySelector('[aria-label="Choose whose sessions to show"]')!;

beforeAll(() => {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }) as unknown as MediaQueryList;
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

beforeEach(() => {
  host = document.body.appendChild(document.createElement('div'));
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = '';
});

describe('the sidebar’s Connections', () => {
  it('names the Connection shown by its Display Name alone', () => {
    render('m2');
    expect(title().textContent).toContain('Work');
    expect(title().textContent).not.toContain('Ada-Mini');
  });

  it('names one with no Display Name by its Computer Name as it was served', () => {
    render('m3');
    expect(title().textContent).toContain('home');
    expect(title().textContent).not.toContain('Ada-iMac');
  });

  it('says each Computer Name beside a Display Name in the Drawer, so two of one name are told apart', async () => {
    render(null);
    await act(async () => (title() as HTMLElement).click());
    const choices = [
      ...document.querySelectorAll<HTMLElement>('[role="radio"]'),
    ].map((each) => each.textContent ?? '');
    const work = choices.filter((each) => each.startsWith('Work'));
    expect(work).toHaveLength(2);
    expect(work[0]).toContain('Ada-MacBook');
    expect(work[1]).toContain('Ada-Mini (studio)');
    const home = choices.find((each) => each.startsWith('home'));
    expect(home).not.toContain('Ada-iMac');
  });
});
