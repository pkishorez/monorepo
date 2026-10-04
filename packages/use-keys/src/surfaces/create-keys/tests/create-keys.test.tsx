// @vitest-environment jsdom
import { act, type ReactNode, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sequence, shortcut } from '../../../core/index.ts';
import { createKeys } from '../../index.ts';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const key = (type: 'keydown' | 'keyup', init: KeyboardEventInit) => {
  const event = new KeyboardEvent(type, {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  act(() => {
    document.body.dispatchEvent(event);
  });
  return event;
};

const tap = (name: string, init: KeyboardEventInit = {}) => {
  const code = name.length === 1 ? `Key${name.toUpperCase()}` : name;
  const down = key('keydown', { key: name, code, ...init });
  key('keyup', { key: name, code, ...init });
  return down;
};

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const render = (node: ReactNode) => act(() => root.render(node));

const keys = createKeys({
  actions: {
    palette: { keys: [shortcut('ctrl+k')], description: 'Open the palette' },
    close: { keys: [shortcut('Escape')], description: 'Close everything' },
  },
  surfaces: {
    inbox: {
      actions: {
        archive: { keys: [shortcut('e')], description: 'Archive' },
        next: { keys: [shortcut('j')], description: 'Next', repeat: true },
        top: { keys: [sequence('g g')], description: 'Top' },
        bottom: { keys: [sequence('g b')], description: 'Bottom' },
        sidebar: { keys: [shortcut('ctrl+h')], description: 'To sidebar' },
      },
      surfaces: {
        reply: {
          actions: {
            discard: { keys: [shortcut('Escape')], description: 'Discard' },
          },
        },
        confirm: {
          isolated: true,
          actions: {
            yes: { keys: [shortcut('y')], description: 'Confirm' },
          },
          surfaces: {
            locked: {
              globals: false,
              actions: {
                unlock: { keys: [shortcut('u')], description: 'Unlock' },
              },
            },
          },
        },
      },
    },
    sidebar: {
      actions: {
        open: { keys: [shortcut('e')], description: 'Open folder' },
      },
    },
  },
});

type Surface = Parameters<typeof keys.Provider>[0]['surface'];
type Props = Parameters<typeof keys.Provider>[0];

const calls: string[] = [];

// Every Action logs its id when it runs.
function Handlers(props: { readonly without?: string }) {
  const { setSurface } = keys.useSurface();
  const on = (id: Parameters<typeof keys.useAction>[0]) =>
    keys.useAction(id, () => calls.push(id), {
      enabled: props.without !== id,
    });
  on('palette');
  on('close');
  on('inbox.archive');
  on('inbox.next');
  on('inbox.top');
  on('inbox.bottom');
  on('inbox.reply.discard');
  on('sidebar.open');
  on('inbox.confirm.yes');
  on('inbox.confirm.locked.unlock');
  keys.useAction('inbox.sidebar', () => setSurface('sidebar'));
  return null;
}

let status: ReturnType<typeof keys.useStatus>;
let run: ReturnType<typeof keys.useRun>;
let surfaces: ReturnType<typeof keys.useSurface>;
function Status() {
  status = keys.useStatus();
  run = keys.useRun();
  surfaces = keys.useSurface();
  return null;
}

function App(props: Partial<Props> & { readonly without?: string }) {
  const [surface, setSurface] = useState<Surface>(
    props.surface === undefined ? 'inbox' : props.surface,
  );
  return (
    <keys.Provider
      surface={surface}
      onSurfaceChange={setSurface}
      {...(props.bindings ? { bindings: props.bindings } : {})}
      repeat={{ delay: 300, interval: 50 }}
    >
      <Handlers {...(props.without ? { without: props.without } : {})} />
      <Status />
    </keys.Provider>
  );
}

beforeEach(() => {
  calls.length = 0;
});

const stateOf = (id: string) =>
  status.actions.find((action) => action.id === id)?.state;

describe('createKeys', () => {
  it('works the Actions of the Active Surface and the Global ones', () => {
    render(<App />);
    tap('e');
    tap('k', { ctrlKey: true });
    expect(calls).toEqual(['inbox.archive', 'palette']);
    expect(stateOf('sidebar.open')).toBe('inactive');
  });

  it('lets a Handler move to another Surface', () => {
    render(<App />);
    tap('h', { ctrlKey: true });
    tap('e');
    expect(calls).toEqual(['sidebar.open']);
    expect(status.surface).toBe('sidebar');
  });

  it('works only the Global Actions with no Active Surface', () => {
    render(<App surface={null} />);
    tap('e');
    tap('Escape');
    expect(calls).toEqual(['close']);
  });

  it('lets the nearest Action win, statically', () => {
    render(<App surface="inbox.reply" />);
    tap('Escape');
    tap('e');
    expect(calls).toEqual(['inbox.reply.discard', 'inbox.archive']);
    expect(stateOf('close')).toBe('shadowed');
    render(<App surface="inbox.reply" without="inbox.reply.discard" />);
    tap('Escape');
    expect(calls.at(-1)).toBe('close');
    expect(stateOf('inbox.reply.discard')).toBe('unhandled');
  });

  it('stops the Surfaces around an Isolated one, but not the Globals', () => {
    render(<App surface="inbox.confirm" />);
    tap('e');
    tap('y');
    tap('Escape');
    expect(calls).toEqual(['inbox.confirm.yes', 'close']);
    expect(stateOf('inbox.archive')).toBe('inactive');
    expect(run('inbox.archive')).toBe(false);
  });

  it('stops the Globals inside a Surface that turns them off', () => {
    render(<App surface="inbox.confirm.locked" />);
    tap('Escape');
    tap('e');
    tap('y');
    tap('u');
    expect(calls).toEqual(['inbox.confirm.yes', 'inbox.confirm.locked.unlock']);
    expect(stateOf('close')).toBe('inactive');
  });

  it('opens a Surface and closes it back to where it was opened from', () => {
    render(<App surface="inbox.reply" />);
    act(() => surfaces.openSurface('inbox.confirm'));
    act(() => surfaces.openSurface('inbox.confirm.locked'));
    expect(status.surface).toBe('inbox.confirm.locked');
    act(() => surfaces.closeSurface('inbox.confirm.locked'));
    expect(status.surface).toBe('inbox.confirm');
    act(() => surfaces.closeSurface('inbox.confirm'));
    expect(status.surface).toBe('inbox.reply');
  });

  it('closes every Surface opened after the one it closes', () => {
    render(<App />);
    act(() => surfaces.openSurface('inbox.confirm'));
    act(() => surfaces.openSurface('sidebar'));
    act(() => surfaces.openSurface('inbox.reply'));
    act(() => surfaces.closeSurface('sidebar'));
    expect(status.surface).toBe('inbox.confirm');
  });

  it('opens nothing already Open, and closes nothing not opened', () => {
    render(<App />);
    act(() => surfaces.openSurface('inbox.confirm'));
    act(() => surfaces.openSurface('inbox.confirm.locked'));
    act(() => surfaces.openSurface('inbox.confirm'));
    expect(status.surface).toBe('inbox.confirm.locked');
    act(() => surfaces.closeSurface('sidebar'));
    expect(status.surface).toBe('inbox.confirm.locked');
    act(() => surfaces.closeSurface('inbox.confirm'));
    expect(status.surface).toBe('inbox');
  });

  it('keeps the way back when one Surface closes and another opens at once', () => {
    render(<App />);
    act(() => surfaces.openSurface('inbox.confirm'));
    act(() => {
      surfaces.closeSurface('inbox.confirm');
      surfaces.openSurface('sidebar');
    });
    expect(status.surface).toBe('sidebar');
    act(() => surfaces.closeSurface('sidebar'));
    expect(status.surface).toBe('inbox');
  });

  it('forgets the way back when the Surface is set', () => {
    render(<App />);
    act(() => surfaces.openSurface('inbox.confirm'));
    act(() => surfaces.setSurface('sidebar'));
    act(() => surfaces.openSurface('inbox.reply'));
    act(() => surfaces.setSurface('inbox.confirm'));
    act(() => surfaces.closeSurface('inbox.confirm'));
    expect(status.surface).toBe('inbox.confirm');
  });

  it('puts the user’s own Bindings in place of the defaults, at once', () => {
    render(<App />);
    render(<App bindings={{ 'inbox.archive': [shortcut('a')] }} />);
    tap('e');
    tap('a');
    expect(calls).toEqual(['inbox.archive']);
  });

  it('lets the user’s own Binding win a Conflict with a default, and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<App bindings={{ 'inbox.archive': [shortcut('j')] }} />);
    tap('j');
    expect(calls).toEqual(['inbox.archive']);
    expect(warn).toHaveBeenCalledWith(
      'use-keys: "j" of "inbox.next" does not work: "inbox.archive" has it.',
    );
  });

  it('says which Sequences are under way, and how to finish them', () => {
    render(<App />);
    expect(status.sequence).toEqual({ type: 'idle' });
    tap('g');
    expect(status.sequence).toEqual({
      type: 'possible',
      pressed: [shortcut('g')],
      next: [
        { id: 'inbox.top', description: 'Top', step: shortcut('g') },
        { id: 'inbox.bottom', description: 'Bottom', step: shortcut('b') },
      ],
    });
    tap('g');
    expect(calls).toEqual(['inbox.top']);
    expect(status.sequence).toEqual({ type: 'idle' });
  });

  it('Repeats as the definition says, unless the Handler overrides it', () => {
    render(<App />);
    key('keydown', { key: 'j', code: 'KeyJ' });
    act(() => vi.advanceTimersByTime(300 + 50));
    key('keyup', { key: 'j', code: 'KeyJ' });
    expect(calls).toEqual(['inbox.next', 'inbox.next', 'inbox.next']);
  });

  it('runs an Action by id, Shadowed or not, only where it can work', () => {
    render(<App surface="inbox.reply" />);
    expect(run('close')).toBe(true);
    expect(run('sidebar.open')).toBe(false);
    expect(calls).toEqual(['close']);
  });

  it('warns about a second Handler and keeps the first', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    function Again() {
      keys.useAction('inbox.archive', () => calls.push('again'));
      return null;
    }
    render(
      <keys.Provider surface="inbox">
        <Handlers />
        <Again />
      </keys.Provider>,
    );
    tap('e');
    expect(calls).toEqual(['inbox.archive']);
    expect(warn).toHaveBeenCalledWith(
      'use-keys: "inbox.archive" has two Handlers; the first one keeps it.',
    );
  });
});

// Types only: these lines fail to compile when the ids are wrong.
export const typed = () => {
  // @ts-expect-error no such Action
  keys.useAction('inbox.nothing', () => {});
  // @ts-expect-error an Action is not a Surface
  render(<keys.Provider surface="inbox.archive" />);
  render(<keys.Provider surface="inbox.confirm.locked" />);
  // @ts-expect-error only a Surface is Isolated
  createKeys({ isolated: true });
  keys.useAction('inbox.reply.discard', () => {});
};
