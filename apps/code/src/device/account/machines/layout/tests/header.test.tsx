// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Connection } from '../../machine/connection/index.ts';
import * as routes from '../../../../routes/index.ts';
import { Offline, Title } from '../layout.tsx';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/*
 * The header's offline mark: nothing while the Machine is in reach; out of
 * reach, a word for a phone's header and the whole reason for a wide one,
 * each drawn only at its width; and, from a list only kept and not yet
 * checked, only connecting. Its title: never "not found" for a row still
 * to be read.
 */

const machine = (lastSeen: number, status: object) => ({
  id: 'm1',
  name: 'Laptop',
  key: 'k',
  version: '0.0.1',
  status,
  lastSeen,
});

let host: HTMLDivElement;
let root: Root;

const render = (
  lastSeen: number,
  status: object,
  line: 'connected' | 'connecting' | 'reconnecting',
  checked = true,
) =>
  act(() =>
    root.render(
      <Connection
        value={{
          machines: [machine(lastSeen, status)] as never,
          status: { m1: line },
          checked,
        }}
      >
        <Offline machineId="m1" />
      </Connection>,
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

  it('is not drawn while the Machine is in reach', () => {
    render(Date.now(), reachable, 'connected');
    expect(host.textContent).toBe('');
  });

  it('says the Machine is down in a word on a phone, with when it was last seen wide', () => {
    render(Date.now() - 10 * 60_000, reachable, 'reconnecting');
    expect(words().phone).toBe('Machine down');
    expect(words().wide).toMatch(/^Machine down · last seen /);
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
      'reconnecting',
    );
    expect(words().phone).toBe('Out of reach');
    expect(words().wide).toMatch(/^Out of reach · seen /);
  });

  it('says only Connecting, never down, from a kept list not yet checked', () => {
    render(Date.now() - 18 * 60_000, reachable, 'connecting', false);
    expect(words().phone).toBe('Connecting…');
    expect(words().wide).toBe('Connecting…');
    // Checked, the same record is believed: the Machine is down.
    render(Date.now() - 18 * 60_000, reachable, 'connecting', true);
    expect(words().phone).toBe('Machine down');
  });

  it('says a socket up and dropped since is down, checked or not', () => {
    render(Date.now() - 18 * 60_000, reachable, 'reconnecting', false);
    expect(words().phone).toBe('Machine down');
  });
});

describe('the title', () => {
  const title = (pending: boolean, unknown: boolean) =>
    act(() =>
      root.render(
        <Connection value={{ machines: [], status: {}, checked: true }}>
          <Title
            route={routes.project('m1', 'p1')}
            project={undefined}
            session={undefined}
            pending={pending}
            unknown={unknown}
          />
        </Connection>,
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
