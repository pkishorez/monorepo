// @vitest-environment jsdom
import type { Project, Session } from '@kestack/connect/code';
import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { keys } from '../../../../commands.ts';
import type { OnConnection } from '../../../../../connection/records/index.ts';
import { Places } from '../../list.tsx';

/*
 * With a mouse, a Session's row dragged onto "Settled" is Settled, and a
 * Settled one dragged back onto the Sessions is un-Settled. Each place
 * takes only a row that is not there yet, and is lit while one it takes
 * is over it. A row carries which Session it is, never its link as text.
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
  useAppShell: (() => ({ open: true, setOpen: () => {} })) as never,
}));

const project = {
  id: 'a',
  name: 'a project',
  path: '/a',
  connectionId: 'm1',
} as OnConnection<Project>;
const session = (id: string, settledAt: number | null) =>
  ({
    id,
    projectId: 'a',
    connectionId: 'm1',
    title: id,
    status: 'idle',
    settledAt,
    forkedFrom: null,
    activeAt: 1,
    endedAt: null,
    worktree: null,
    branch: null,
  }) as unknown as OnConnection<Session>;

const sessions = [session('open', null), session('done', 5)];

/** What the browser hands a drag, as far as the sidebar reads it. */
const transfer = () => {
  const data = new Map<string, string>([['text/plain', 'https://link']]);
  return {
    get types() {
      return [...data.keys()];
    },
    setData: (kind: string, value: string) => void data.set(kind, value),
    getData: (kind: string) => data.get(kind) ?? '',
    clearData: () => data.clear(),
    setDragImage: () => {},
    effectAllowed: 'all',
    dropEffect: 'none',
  };
};

describe('a row dragged with a mouse', () => {
  let host: HTMLDivElement;
  let root: Root;
  let moves: Array<[string, boolean]>;

  const fire = (
    type: string,
    target: Element,
    dataTransfer: ReturnType<typeof transfer>,
  ) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
    act(() => void target.dispatchEvent(event));
    return event;
  };
  const row = (id: string) =>
    [...host.querySelectorAll('[data-place]')].find(
      (each) => each.textContent?.startsWith(id) === true,
    )!;
  const settled = () => host.querySelector('section[aria-label="Settled"]')!;
  const header = () => host.querySelector('[data-place="settled"]')!;
  const timeline = () => host.querySelector('section[aria-label="Sessions"]')!;
  /** Drags `from` over `to` and drops it there. */
  const drag = (from: Element, to: Element) => {
    const carried = transfer();
    fire('dragstart', from, carried);
    const over = fire('dragover', to, carried);
    const lit = to.closest('[data-over]') !== null;
    fire('drop', to, carried);
    return { carried, taken: over.defaultPrevented, lit };
  };

  beforeEach(() => {
    moves = [];
    host = document.body.appendChild(document.createElement('div'));
    root = createRoot(host);
    act(() =>
      root.render(
        <keys.Provider>
          <Places
            read="m1"
            route={{ _tag: 'Home' } as never}
            projects={{ rows: [project], waiting: [] }}
            sessions={sessions}
            connections={null}
            collapsed={[]}
            onCollapse={() => {}}
            isUnseen={() => false}
            isAsking={() => false}
            isWorking={() => false}
            onOpenSession={() => {}}
            onUnsettle={() => {}}
            onMove={({ id }, to) => void moves.push([id, to])}
          />
        </keys.Provider>,
      ),
    );
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('onto "Settled" Settles it, lit while it is over, carrying no text', () => {
    const { carried, taken, lit } = drag(row('open'), header());
    expect(carried.types).toEqual(['application/x-code-session']);
    expect(taken).toBe(true);
    expect(lit).toBe(true);
    expect(moves).toEqual([['open', true]]);
    expect(settled().hasAttribute('data-over')).toBe(false);
  });

  it('back onto the Sessions un-Settles a Settled one', () => {
    act(() => (header() as HTMLElement).click());
    expect(drag(row('done'), timeline()).taken).toBe(true);
    expect(moves).toEqual([['done', false]]);
  });

  it('is not taken where it already is', () => {
    expect(drag(row('open'), timeline())).toMatchObject({
      taken: false,
      lit: false,
    });
    act(() => (header() as HTMLElement).click());
    expect(drag(row('done'), header()).taken).toBe(false);
    expect(moves).toEqual([]);
  });
});
