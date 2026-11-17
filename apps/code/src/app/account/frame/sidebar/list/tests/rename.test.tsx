// @vitest-environment jsdom
import type { Project, Session } from '@kestack/connect/code';
import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { keys } from '../../../commands.ts';
import type { OnConnection } from '../../../../connection/records/index.ts';
import { Places } from '../list.tsx';

/*
 * With a mouse, a right click on a Session's row offers Rename, which
 * turns its title into a field, its text chosen. Enter, or a click away,
 * gives the Session the Title typed, trimmed, and the row reads it at
 * once; Escape, or a Title left empty or as it was, gives none.
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
    <button type="button" data-place={rest['data-place']} onClick={onClick}>
      {children}
    </button>
  ),
  useAppShell: (() => ({ open: true, setOpen: () => {} })) as never,
}));

const project = {
  id: 'a',
  name: 'a project',
  path: '/a',
  connectionId: 'm1',
} as OnConnection<Project>;
const session = {
  id: 's1',
  projectId: 'a',
  connectionId: 'm1',
  title: 'Fix the login',
  status: 'idle',
  settledAt: null,
  forkedFrom: null,
  activeAt: 1,
  endedAt: null,
  worktree: null,
  branch: null,
} as unknown as OnConnection<Session>;

const flush = () => act(() => new Promise((done) => setTimeout(done, 0)));

describe('a row renamed', () => {
  let host: HTMLDivElement;
  let root: Root;
  let renamed: Array<[string, string]>;

  const row = () => host.querySelector<HTMLElement>('[data-place^="s:"]')!;
  const field = () =>
    document.querySelector<HTMLInputElement>('[aria-label="Session title"]');
  const rename = async () => {
    await act(async () =>
      row().dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          button: 2,
          clientX: 10,
          clientY: 10,
        }),
      ),
    );
    await flush();
    const item = [...document.querySelectorAll('[role="menuitem"]')].find(
      (each) => each.textContent === 'Rename',
    ) as HTMLElement;
    await act(async () => item.click());
    await flush();
  };
  const type = (text: string) =>
    act(() => {
      const input = field()!;
      // As React hears a user type it.
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )!.set!.call(input, text);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  const press = (key: string) =>
    act(() => {
      field()!.dispatchEvent(
        new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
      );
    });

  beforeEach(() => {
    renamed = [];
    host = document.body.appendChild(document.createElement('div'));
    root = createRoot(host);
    act(() =>
      root.render(
        <keys.Provider>
          <Places
            read="m1"
            route={{ _tag: 'Home' } as never}
            projects={{ rows: [project], waiting: [] }}
            sessions={[session]}
            connections={null}
            collapsed={[]}
            onCollapse={() => {}}
            isUnseen={() => false}
            isAsking={() => false}
            isWorking={() => false}
            onOpenSession={() => {}}
            onUnsettle={() => {}}
            onMove={() => {}}
            onRename={({ id }, title) => void renamed.push([id, title])}
          />
        </keys.Provider>,
      ),
    );
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = '';
  });

  it('opens a field from a right click, its title chosen, and takes the Title typed on Enter', async () => {
    await rename();
    const input = field()!;
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe('Fix the login');
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 13]);
    await type('  Fix the sign-in  ');
    await press('Enter');
    expect(renamed).toEqual([['s1', 'Fix the sign-in']]);
    expect(field()).toBeNull();
    // Read at once, before its Connection syncs it.
    expect(row().textContent).toContain('Fix the sign-in');
  });

  it('takes it on a click away too', async () => {
    await rename();
    await type('Elsewhere');
    await act(async () => field()!.blur());
    expect(renamed).toEqual([['s1', 'Elsewhere']]);
  });

  it('gives none on Escape, nor for a Title left empty or as it was', async () => {
    await rename();
    await type('Not this');
    await press('Escape');
    expect(field()).toBeNull();
    await rename();
    await type('   ');
    await press('Enter');
    await rename();
    await press('Enter');
    expect(renamed).toEqual([]);
    expect(row().textContent).toContain('Fix the login');
  });
});
