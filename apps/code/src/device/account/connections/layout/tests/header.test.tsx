// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Links } from '../../connection/link/index.ts';
import * as routes from '../../../../routes/index.ts';
import { CONNECTED_FOR, Offline, Title } from '../layout.tsx';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/*
 * The header's offline mark: nothing while the Connection is in reach; out of
 * reach, a word for a phone's header and the whole reason for a wide one,
 * each drawn only at its width; and, from a list only kept and not yet
 * checked, only linking; once back, Connected for a moment. Its title: never "not found" for a row still
 * to be read.
 */

const connection = (
  lastSeen: number,
  status: object,
  plugins: object = {},
) => ({
  id: 'm1',
  name: 'Laptop',
  key: 'k',
  version: '0.0.1',
  status,
  lastSeen,
  plugins,
  wanted: {},
  minConnect: null,
});

let host: HTMLDivElement;
let root: Root;

const render = (
  lastSeen: number,
  status: object,
  link: 'linked' | 'linking' | 'relinking',
  checked = true,
  plugins: object = {},
) =>
  act(() =>
    root.render(
      <Links
        value={{
          connections: [connection(lastSeen, status, plugins)] as never,
          status: { m1: link },
          checked,
        }}
      >
        <Offline connectionId="m1" />
      </Links>,
    ),
  );

/** What the phone's header says, and the wide one's. */
const words = () => ({
  phone: host.querySelector('.md\\:hidden')?.textContent ?? null,
  wide: host.querySelector('.max-md\\:hidden')?.textContent ?? null,
});

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('the offline mark', () => {
  const reachable = { _tag: 'Reachable', url: 'https://a.example', at: 0 };

  it('is not drawn while the Connection is in reach', () => {
    render(Date.now(), reachable, 'linked');
    expect(host.textContent).toBe('');
  });

  it('says the Connection is down in a word on a phone, with when it was last seen wide', () => {
    render(Date.now() - 10 * 60_000, reachable, 'relinking');
    expect(words().phone).toBe('Connection down');
    expect(words().wide).toMatch(/^Connection down · last seen /);
  });

  it('says it is out of reach while its tunnel is broken', () => {
    render(
      Date.now() - 5_000,
      {
        _tag: 'Unreachable',
        url: 'https://a.example',
        problem: 'no route',
        at: Date.now() - 5_000,
      },
      'relinking',
    );
    expect(words().phone).toBe('Out of reach');
    expect(words().wide).toMatch(/^Out of reach · seen /);
  });

  it('says only Linking, never down, from a kept list not yet checked', () => {
    render(Date.now() - 18 * 60_000, reachable, 'linking', false);
    expect(words().phone).toBe('Connecting…');
    expect(words().wide).toBe('Connecting…');
    // Checked, the same record is believed: the Connection is down.
    render(Date.now() - 18 * 60_000, reachable, 'linking', true);
    expect(words().phone).toBe('Connection down');
  });

  it('says a socket up and dropped since is connecting until checked, then down', () => {
    render(Date.now() - 18 * 60_000, reachable, 'relinking', false);
    expect(words().phone).toBe('Connecting…');
    render(Date.now() - 18 * 60_000, reachable, 'relinking', true);
    expect(words().phone).toBe('Connection down');
  });

  it('says Connected, green, for a moment once it is back, then nothing', async () => {
    render(Date.now(), reachable, 'relinking', false);
    expect(words().phone).toBe('Connecting…');
    render(Date.now(), reachable, 'linked');
    expect(host.textContent).toBe('Connected');
    expect(host.querySelector('.bg-positive')).not.toBeNull();
    await act(
      () => new Promise((done) => setTimeout(done, CONNECTED_FOR + 50)),
    );
    expect(host.textContent).toBe('');
  });

  it('says nothing when it was in reach all along', () => {
    render(Date.now(), reachable, 'linked');
    render(Date.now(), reachable, 'linked');
    expect(host.textContent).toBe('');
  });

  it('leaves linking to the Notice while the code Plugin is Updating', () => {
    render(Date.now(), reachable, 'relinking', true, {
      code: { _tag: 'Starting', hash: 'a'.repeat(64) },
    });
    expect(host.textContent).toBe('');
  });
});

describe('the title', () => {
  const title = (pending: boolean, unknown: boolean) =>
    act(() =>
      root.render(
        <Links value={{ connections: [], status: {}, checked: true }}>
          <Title
            route={routes.project('m1', 'p1')}
            project={undefined}
            session={undefined}
            pending={pending}
            unknown={unknown}
          />
        </Links>,
      ),
    );

  it('draws nothing for a row the Store or the server has yet to give', () => {
    title(true, false);
    expect(host.textContent).toBe('');
  });

  it('says a row is not found only once it can be', () => {
    title(false, false);
    expect(host.textContent).toBe('Project not found');
  });
});
