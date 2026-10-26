// @vitest-environment jsdom
import type { Project, Session } from '@kestack/connect/code';
import { GestureProvider } from '@kestack/web-platform/ui/input';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { keys } from '../../../../commands.ts';
import type { OnConnection } from '../../../../../connection/records/index.ts';
import { SettledList, settledOf } from '../settled.tsx';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

// A row with no router or app shell around it: what it holds.
vi.mock(import('@kestack/web-platform/recipes/frame'), async (actual) => ({
  ...(await actual()),
  SidebarMenuButton: ({ children }: { readonly children?: ReactNode }) => (
    <div>{children}</div>
  ),
}));

const project = (id: string) =>
  ({
    id,
    name: `${id} project`,
    path: `/${id}`,
    createdAt: 0,
    connectionId: 'm1',
  }) as OnConnection<Project>;
const session = (id: string, projectId: string, settledAt: number | null) =>
  ({ id, projectId, settledAt, connectionId: 'm1' }) as OnConnection<Session>;

describe('the Settled List', () => {
  it('holds only Settled sessions, the most recently Settled first, each with its project', () => {
    const listed = settledOf(
      [project('a'), project('b')],
      [
        session('s1', 'a', 10),
        session('s2', 'b', null),
        session('s3', 'b', 30),
        session('s4', 'gone', 20),
      ],
    );
    expect(listed.map(({ session, project }) => [session.id, project])).toEqual(
      [
        ['s3', 'b project'],
        ['s4', null],
        ['s1', 'a project'],
      ],
    );
  });
});

/*
 * Each Settled row's button Un-settles it. With a keyboard it is drawn,
 * on hover or focus; with none, the row swipes instead, and the button is
 * there only for a screen reader, which cannot swipe.
 */
describe('a Settled row', () => {
  let host: HTMLDivElement;
  let root: Root;
  let unsettled: Array<string>;

  const render = (keyboard: boolean) => {
    document.documentElement.toggleAttribute('data-keyboard', keyboard);
    window.matchMedia = (query: string) =>
      ({
        matches: !keyboard && query.includes('coarse'),
        media: query,
        addEventListener() {},
        removeEventListener() {},
      }) as unknown as MediaQueryList;
    act(() =>
      root.render(
        <GestureProvider>
          <keys.Provider>
            <SettledList
              listed={settledOf(
                [project('a')],
                [{ ...session('s1', 'a', 10), title: 'Fix the bug' }],
              )}
              open={null}
              at={() => undefined}
              onUnsettle={(_, id) => void unsettled.push(id)}
              onMove={() => {}}
            />
          </keys.Provider>
        </GestureProvider>,
      ),
    );
  };
  const button = () =>
    host.querySelector<HTMLButtonElement>(
      'button[aria-label="Un-settle Fix the bug"]',
    );

  beforeEach(() => {
    unsettled = [];
    host = document.body.appendChild(document.createElement('div'));
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.documentElement.removeAttribute('data-keyboard');
  });

  it('shows its Un-settle button with a keyboard, touch screen or not', () => {
    render(true);
    expect(button()?.className).not.toContain('sr-only');
    act(() => button()!.click());
    expect(unsettled).toEqual(['s1']);
  });

  it('keeps it for a screen reader alone with no keyboard', () => {
    render(false);
    expect(button()?.className).toBe('sr-only');
    act(() => button()!.click());
    expect(unsettled).toEqual(['s1']);
  });
});

/*
 * Rows move in only as they arrive live: the rows first drawn, and the
 * rows drawn afresh under a new read (`key`, as the sidebar hands it the
 * Connections read), are drawn as they are.
 */
describe('a row arriving', () => {
  let host: HTMLDivElement;
  let root: Root;

  const render = (read: string, ids: ReadonlyArray<string>) =>
    act(() =>
      root.render(
        <GestureProvider>
          <keys.Provider>
            <SettledList
              key={read}
              listed={settledOf(
                [project('a')],
                ids.map((id) => ({ ...session(id, 'a', 10), title: id })),
              )}
              open={null}
              at={() => undefined}
              onUnsettle={() => {}}
              onMove={() => {}}
            />
          </keys.Provider>
        </GestureProvider>,
      ),
    );
  /** The rows still to move in, by title. */
  const moving = () =>
    [...host.querySelectorAll<HTMLElement>('li')]
      .filter((row) => row.style.opacity === '0')
      .map((row) => row.textContent?.match(/s\d/)?.[0]);

  beforeEach(() => {
    document.documentElement.toggleAttribute('data-keyboard', true);
    host = document.body.appendChild(document.createElement('div'));
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.documentElement.removeAttribute('data-keyboard');
  });

  it('does not move the rows first drawn', () => {
    render('m1', ['s1', 's2']);
    expect(host.querySelectorAll('li')).toHaveLength(2);
    expect(moving()).toEqual([]);
  });

  it('moves in a row that arrives after', () => {
    render('m1', ['s1']);
    render('m1', ['s1', 's2']);
    expect(moving()).toEqual(['s2']);
  });

  it('does not move rows drawn afresh under a new read', () => {
    render('m1', ['s1']);
    render('m1 m2', ['s1', 's2', 's3']);
    expect(host.querySelectorAll('li')).toHaveLength(3);
    expect(moving()).toEqual([]);
  });
});
