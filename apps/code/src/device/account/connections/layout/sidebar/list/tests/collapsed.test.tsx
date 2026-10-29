// @vitest-environment jsdom
import type { Project, Session } from '@kestack/connect/code';
import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { keys } from '../../../commands.ts';
import type { OnConnection } from '../../../../connection/records/index.ts';
import { Places } from '../list.tsx';

/*
 * The sidebar with its Connections collapsed: each name still shows, with
 * how many Projects it hides, so it can be opened again, and the empty
 * words show only when nothing is listed at all. With one Connection
 * shown, no name, so nothing collapsed hides anything.
 */

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

type ButtonProps = ComponentProps<'button'> & {
  readonly 'data-place'?: string;
};

// No router or app shell around it: a button for each, holding what it holds.
vi.mock(import('@kestack/web-platform/recipes/frame'), async (actual) => ({
  ...(await actual()),
  SidebarMenu: ({ children }: ComponentProps<'ul'>) => <ul>{children}</ul>,
  SidebarMenuItem: ({ children }: ComponentProps<'li'>) => <li>{children}</li>,
  SidebarMenuButton: ({ children, onClick, ...rest }: ButtonProps) => (
    <button
      type="button"
      aria-expanded={rest['aria-expanded']}
      data-place={rest['data-place']}
      onClick={onClick}
    >
      {children}
    </button>
  ),
  // Only whether it is open, and a way to open it, are read.
  useAppShell: (() => ({ open: true, setOpen: () => {} })) as never,
}));

const project = (id: string, connectionId: string) =>
  ({
    id,
    name: `${id} project`,
    path: `/${id}`,
    connectionId,
  }) as OnConnection<Project>;
const session = (id: string, projectId: string, connectionId: string) =>
  ({
    id,
    projectId,
    connectionId,
    title: id,
    status: 'idle',
    settledAt: null,
    forkedFrom: null,
    activeAt: 1,
    endedAt: null,
    worktree: null,
    branch: null,
  }) as unknown as OnConnection<Session>;

const projects = [project('a', 'm1'), project('b', 'm1'), project('c', 'm2')];
const sessions = [
  session('a1', 'a', 'm1'),
  session('b1', 'b', 'm1'),
  session('c1', 'c', 'm2'),
];
const named = new Map([
  ['m1', 'one'],
  ['m2', 'two'],
]);

describe('the sidebar, its Connections collapsed', () => {
  let host: HTMLDivElement;
  let root: Root;

  const render = (
    connections: ReadonlyMap<string, string> | null,
    collapsed: ReadonlyArray<string>,
  ) =>
    act(() =>
      root.render(
        <keys.Provider>
          <Places
            read="m1 m2"
            route={{ _tag: 'Home' } as never}
            projects={{ rows: projects, waiting: [] }}
            sessions={sessions}
            connections={connections}
            collapsed={collapsed}
            onCollapse={() => {}}
            isUnseen={() => false}
            isAsking={() => false}
            onOpenSession={() => {}}
            onUnsettle={() => {}}
            onMove={() => {}}
          />
        </keys.Provider>,
      ),
    );
  const text = () => host.textContent ?? '';
  const names = () =>
    [...host.querySelectorAll('[data-place^="c:"]')].map(
      (each) => each.textContent,
    );

  beforeEach(() => {
    host = document.body.appendChild(document.createElement('div'));
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('shows every name, with its count, and no empty words, all collapsed', () => {
    render(named, ['m1', 'm2']);
    expect(names()).toEqual(['one (2 projects)', 'two (1 project)']);
    expect(text()).not.toContain('No sessions yet');
    expect(host.querySelector('[data-place^="p:"]')).toBeNull();
  });

  it('hides nothing with one Connection shown, whatever was collapsed', () => {
    render(null, ['m1', 'm2']);
    expect(names()).toEqual([]);
    expect(host.querySelectorAll('[data-place^="p:"]')).toHaveLength(3);
    expect(text()).not.toContain('No sessions yet');
  });
});
