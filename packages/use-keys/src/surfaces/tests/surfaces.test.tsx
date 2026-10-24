// @vitest-environment jsdom
import { act, type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { describe as said } from '../../core/index.ts';
import { type ActionId, createKeys, type SurfaceName } from '../index.ts';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const key = (
  target: EventTarget,
  type: 'keydown' | 'keyup',
  init: KeyboardEventInit,
) => {
  const event = new KeyboardEvent(type, {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
};

const tap = (
  name: string,
  init: KeyboardEventInit = {},
  target: EventTarget = document.activeElement ?? document.body,
) => {
  const code = name.length === 1 ? `Key${name.toUpperCase()}` : name;
  const down = key(target, 'keydown', { key: name, code, ...init });
  key(target, 'keyup', { key: name, code, ...init });
  return down;
};

const pane = (name: string) =>
  host.querySelector(`[data-pane="${name}"]`) as HTMLElement;

const point = (name: string) =>
  act(() => {
    pane(name).dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true }),
    );
  });

const focus = async (selector: string) => {
  await act(async () => {
    (host.querySelector(selector) as HTMLElement).focus();
  });
};

// Lets the focus Entering a Surface moves, after React commits, happen.
const settle = () => act(async () => {});

let host: HTMLDivElement;
let root: Root;
const calls: string[] = [];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  calls.length = 0;
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

/** app ⊃ (sidebar, toolbar, list ⊃ reply, palette). */
const keys = createKeys({
  app: {
    initial: true,
    actions: {
      e: { keys: 'e', label: 'app e' },
      x: { keys: 'x', label: 'app x' },
      j: { keys: 'j', label: 'app j' },
      top: { keys: 'g g', label: 'top' },
      palette: {
        keys: 'mod+k',
        label: 'palette',
        always: true,
        enters: 'palette',
      },
      ctrl: { keys: 'ctrl+h', label: 'ctrl h', always: true },
      send: { keys: 'Enter', label: 'send', inField: true },
      escape: { keys: 'Escape', label: 'app escape' },
      toList: { keys: 'l', label: 'to the list', enters: 'list' },
    },
    surfaces: {
      sidebar: { actions: { x: { keys: 'x', label: 'sidebar x' } } },
      toolbar: { focusable: false },
      list: {
        label: 'List',
        actions: {
          e: { keys: 'e', label: 'list e' },
          escape: { keys: 'Escape', label: 'list escape' },
          down: {
            keys: 'n',
            label: 'down',
            repeat: { delay: 50, interval: 10 },
          },
        },
        surfaces: { reply: {} },
      },
      palette: {
        isolated: true,
        actions: {
          clear: { keys: 'Escape', label: 'clear', always: true },
          j: { keys: 'j', label: 'palette j' },
        },
      },
    },
  },
});

type Id = ActionId<typeof keys.definition>;

function Handle(props: {
  readonly id: Id;
  readonly enabled?: boolean;
  readonly run?: () => void;
}) {
  keys.useAction(props.id, props.run ?? (() => calls.push(props.id)), {
    enabled: props.enabled !== false,
  });
  return null;
}

const handle = (...ids: ReadonlyArray<Id>) =>
  ids.map((id) => <Handle key={id} id={id} />);

let keyboard: ReturnType<typeof keys.useKeyboard>;
let available: ReturnType<typeof keys.useAvailableActions>;
function Probe() {
  keyboard = keys.useKeyboard();
  available = keys.useAvailableActions();
  return null;
}

function Reply() {
  return (
    <keys.Surface id="reply" data-pane="reply">
      <textarea data-field="reply" />
    </keys.Surface>
  );
}

function Mail(props: {
  readonly on?: boolean;
  readonly autoFocus?: boolean;
  readonly replyOutside?: boolean;
  readonly bindings?: Parameters<typeof keys.Provider>[0]['bindings'];
  readonly appearance?: Parameters<typeof keys.Provider>[0]['appearance'];
  readonly onExit?: () => void;
  readonly children?: ReactNode;
}) {
  return (
    <keys.Provider
      vim={props.on ?? true}
      {...(props.autoFocus !== undefined && { autoFocus: props.autoFocus })}
      {...(props.bindings && { bindings: props.bindings })}
      {...(props.appearance && { appearance: props.appearance })}
    >
      <Probe />
      {props.children}
      <keys.Surface id="app" data-pane="app">
        <keys.Surface id="sidebar" data-pane="sidebar" />
        <keys.Surface id="toolbar" data-pane="toolbar" />
        <keys.Surface
          id="list"
          data-pane="list"
          {...(props.onExit && { onExit: props.onExit })}
        >
          <textarea data-field="list" />
          {props.replyOutside === true ? null : <Reply />}
        </keys.Surface>
      </keys.Surface>
      {props.replyOutside === true ? <Reply /> : null}
    </keys.Provider>
  );
}

describe('createKeys', () => {
  it('types Surface names and Action ids from the definition', () => {
    const names: ReadonlyArray<SurfaceName<typeof keys.definition>> = [
      'app',
      'reply',
      'palette',
    ];
    const ids: ReadonlyArray<Id> = ['app.e', 'list.down', 'palette.clear'];
    // @ts-expect-error: no such Surface
    const noSurface: SurfaceName<typeof keys.definition> = 'nope';
    // @ts-expect-error: no such Action
    const noAction: Id = 'app.nope';
    expect([names, ids, noSurface, noAction]).toBeTruthy();
  });

  it('fails to compile, and throws, on a name used twice', () => {
    expect(() =>
      // @ts-expect-error: "b" is used twice
      createKeys({ a: { surfaces: { b: {} } }, c: { surfaces: { b: {} } } }),
    ).toThrow(/two Surfaces are called "b"/);
  });

  it('throws on an `enters` naming no Surface, keys with a typo, or two initial', () => {
    expect(() =>
      createKeys({
        // @ts-expect-error: "nope" is no Surface
        a: { actions: { x: { keys: 'x', label: 'x', enters: 'nope' } } },
      }),
    ).toThrow(/enters "nope"/);
    expect(() =>
      createKeys({ a: { actions: { x: { keys: 'cmd+x', label: 'x' } } } }),
    ).toThrow(/no modifier "cmd"/);
    expect(() =>
      createKeys({ a: { initial: true }, b: { initial: true } }),
    ).toThrow(/more than one Surface is initial/);
  });
});

describe('the Active Surface', () => {
  it('starts on the initial Surface, and a click enters the innermost one drawn', () => {
    render(<Mail />);
    expect(keyboard.active).toBe('app');
    point('reply');
    expect(keyboard.active).toBe('reply');
    expect(keyboard.path).toEqual(['app', 'list', 'reply']);
    expect(keyboard.names).toEqual(['app', 'List', 'reply']);
  });

  it('enters the nearest Focusable Surface above a non-focusable one', () => {
    render(<Mail />);
    point('list');
    point('toolbar');
    expect(keyboard.active).toBe('app');
  });

  it('enters a Surface when focus moves into it, never out of one', async () => {
    render(<Mail />);
    await focus('[data-field="list"]');
    expect(keyboard.active).toBe('list');
    expect(keyboard.mode).toBe('insert');
    await act(async () => (document.activeElement as HTMLElement).blur());
    expect(keyboard.active).toBe('list');
    expect(keyboard.mode).toBe('normal');
  });

  it('follows the keys tree, wherever the element is drawn', () => {
    render(<Mail replyOutside>{handle('list.e', 'app.x')}</Mail>);
    point('reply');
    expect(keyboard.path).toEqual(['app', 'list', 'reply']);
    tap('e');
    tap('x');
    expect(calls).toEqual(['list.e', 'app.x']);
    expect(pane('list').getAttribute('data-state')).toBe('parent');
  });

  it('is entered at once, drawn or not, and the UI follows it', async () => {
    const exits: string[] = [];
    function Palette() {
      const { active } = keys.useSurface('palette');
      if (!active) return null;
      return (
        <>
          <keys.Surface
            id="palette"
            data-pane="palette"
            onExit={() => exits.push('one')}
          />
          <keys.Surface id="palette" onExit={() => exits.push('two')} />
        </>
      );
    }
    render(
      <Mail>
        <Palette />
      </Mail>,
    );
    point('list');
    act(() => keyboard.enter('palette'));
    expect(keyboard.active).toBe('palette');
    await settle();
    expect(document.activeElement).toBe(pane('palette'));
    tap('Escape');
    expect(exits).toEqual(['one', 'two']);
    expect(pane('palette')).toBe(null);
    expect(keyboard.active).toBe('list');
  });

  it('is left by `leave(name)` only while that one is Active', () => {
    render(<Mail />);
    point('reply');
    act(() => keyboard.leave('list'));
    expect(keyboard.active).toBe('reply');
    act(() => keyboard.leave('reply'));
    expect(keyboard.active).toBe('list');
    act(() => keyboard.leave());
    expect(keyboard.active).toBe('app');
  });
});

describe('the elements', () => {
  it('say their state: active, parent, inactive, and off with Vim Mode off', () => {
    render(<Mail />);
    point('list');
    const state = (name: string) => pane(name).getAttribute('data-state');
    expect([
      state('app'),
      state('list'),
      state('sidebar'),
      state('reply'),
    ]).toEqual(['parent', 'active', 'inactive', 'inactive']);
    expect(pane('list').getAttribute('data-surface')).toBe('list');
    expect(pane('list').getAttribute('data-mode')).toBe('normal');
    expect(pane('app').hasAttribute('data-mode')).toBe(false);
    render(<Mail on={false} />);
    expect(state('list')).toBe('off');
    expect(keyboard.active).toBe('list');
  });

  it('take the appearance of their state, their own over the provider’s', () => {
    render(
      <Mail appearance={{ active: 'ring', inactive: 'dim' }}>
        <keys.Surface
          id="palette"
          data-pane="palette"
          className="mine"
          appearance={{ inactive: 'faded' }}
        />
      </Mail>,
    );
    expect(pane('app').className).toBe('ring');
    expect(pane('sidebar').className).toBe('dim');
    expect(pane('palette').className).toBe('mine faded');
    render(<Mail on={false} appearance={{ active: 'ring' }} />);
    expect(pane('app').className).toBe('');
  });

  it('draw on their child with asChild, merging props', () => {
    const ref = { current: null as HTMLElement | null };
    const clicked: string[] = [];
    render(
      <Mail>
        <keys.Surface
          id="sidebar"
          asChild
          className="surface"
          onClick={() => clicked.push('surface')}
        >
          {(s) => (
            <nav
              ref={ref}
              data-pane="nav"
              data-active={String(s.active)}
              className="child"
              onClick={() => clicked.push('child')}
            />
          )}
        </keys.Surface>
      </Mail>,
    );
    const nav = pane('nav');
    expect(nav.tagName).toBe('NAV');
    expect(ref.current).toBe(nav);
    expect(nav.className).toBe('surface child');
    expect(nav.getAttribute('data-surface')).toBe('sidebar');
    act(() => nav.click());
    expect(clicked).toEqual(['child', 'surface']);
    point('nav');
    expect(keyboard.active).toBe('sidebar');
    expect(nav.getAttribute('data-active')).toBe('true');
  });

  it('warn once when the Active one is drawn inside an Inactive one', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(
      <Mail>
        <keys.Surface id="sidebar" data-pane="outer">
          <keys.Surface id="reply" data-pane="inner" />
        </keys.Surface>
      </Mail>,
    );
    point('inner');
    point('list');
    point('inner');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toMatch(
      /"reply" is drawn inside "sidebar"/,
    );
  });
});

describe('keys', () => {
  it('climb from the Active Surface outward; the nearest Action wins', () => {
    render(<Mail>{handle('app.e', 'app.x', 'list.e', 'sidebar.x')}</Mail>);
    point('reply');
    tap('e');
    tap('x');
    expect(calls).toEqual(['list.e', 'app.x']);
  });

  it('pass over an Action without a Handler, or one turned off', () => {
    render(
      <Mail>
        {handle('app.e', 'app.x')}
        <Handle id="list.e" enabled={false} />
      </Mail>,
    );
    point('list');
    tap('e');
    expect(calls).toEqual(['app.e']);
    // Only Actions with a Handler on, or one that enters, are listed.
    expect(available.map((each) => each.id)).toEqual([
      'app.e',
      'app.x',
      'app.palette',
      'app.toList',
    ]);
  });

  it('are Vim only unless Always', () => {
    render(<Mail on={false}>{handle('app.j', 'app.ctrl')}</Mail>);
    tap('j');
    tap('h', { ctrlKey: true });
    expect(calls).toEqual(['app.ctrl']);
  });

  it('turn on with Vim Mode, from useKeyboard', () => {
    render(
      <keys.Provider>
        <Probe />
        {handle('app.j')}
      </keys.Provider>,
    );
    tap('j');
    act(() => keyboard.vim.toggle());
    tap('j');
    expect(keyboard.vim.on).toBe(true);
    expect(calls).toEqual(['app.j']);
  });

  it('run the Handler, then enter the Surface an Action enters', async () => {
    render(<Mail>{handle('app.toList')}</Mail>);
    tap('l');
    expect(calls).toEqual(['app.toList']);
    expect(keyboard.active).toBe('list');
    await settle();
    expect(document.activeElement).toBe(pane('list'));
  });

  it('enter with no Handler at all, and stop at an Isolated Surface', () => {
    render(<Mail>{handle('app.x', 'app.j', 'palette.j')}</Mail>);
    tap('k', { ctrlKey: true });
    expect(keyboard.active).toBe('palette');
    tap('x');
    tap('j');
    expect(calls).toEqual(['palette.j']);
    // A click behind it enters nothing.
    point('list');
    expect(keyboard.active).toBe('palette');
  });

  it('show a Sequence under way, and run it', () => {
    render(<Mail>{handle('app.top')}</Mail>);
    tap('g');
    expect(keyboard.pending).toBe('g');
    tap('g');
    expect(keyboard.pending).toBe(null);
    expect(calls).toEqual(['app.top']);
  });

  it('list what works, nearest first, with what is Shadowed', () => {
    render(
      <Mail>{handle('app.e', 'app.escape', 'list.e', 'list.escape')}</Mail>,
    );
    point('list');
    expect(
      available.map((a) => [a.id, a.surface, a.shadowed, said(a.keys[0]!)]),
    ).toEqual([
      ['list.e', 'list', false, 'e'],
      ['list.escape', 'list', false, 'Escape'],
      ['app.e', 'app', true, 'e'],
      ['app.palette', 'app', false, 'mod+k'],
      ['app.escape', 'app', true, 'Escape'],
      ['app.toList', 'app', false, 'l'],
    ]);
  });

  it('are the user’s own where bindings give them', () => {
    render(<Mail bindings={{ 'app.j': ['n', 'm'] }}>{handle('app.j')}</Mail>);
    tap('j');
    tap('n');
    tap('m');
    expect(calls).toEqual(['app.j', 'app.j']);
  });

  it('say an Action’s keys as bound now, wherever the user is', () => {
    let bound: ReadonlyArray<string> = [];
    function Title() {
      bound = keys.useKeysOf('app.palette').map(said);
      return null;
    }
    render(
      <Mail>
        <Title />
      </Mail>,
    );
    expect(bound).toEqual(['mod+k']);
    render(
      <Mail bindings={{ 'app.palette': ['ctrl+p', 'g p'] }}>
        <Title />
      </Mail>,
    );
    expect(bound).toEqual(['ctrl+p', 'g p']);
  });

  it('repeat at an Action’s own pace', () => {
    render(<Mail>{handle('list.down')}</Mail>);
    point('list');
    key(document.body, 'keydown', { key: 'n', code: 'KeyN' });
    act(() => vi.advanceTimersByTime(50 + 10 * 3));
    key(document.body, 'keyup', { key: 'n', code: 'KeyN' });
    expect(calls).toHaveLength(5);
  });

  it('throw on a Conflict on one Surface, in development', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() =>
      render(
        <Mail bindings={{ 'app.x': 'e' }}>{handle('app.e', 'app.x')}</Mail>,
      ),
    ).toThrow(/conflicts with/);
  });

  it('run with the latest Handler, without attaching again', () => {
    function Counter() {
      const [count, setCount] = useState(0);
      keys.useAction('app.j', () => {
        calls.push(String(count));
        setCount(count + 1);
      });
      return null;
    }
    render(
      <Mail>
        <Counter />
      </Mail>,
    );
    tap('j');
    tap('j');
    expect(calls).toEqual(['0', '1']);
  });
});

describe('Text Entry', () => {
  it('types plain keys, climbs with mod, and keeps bare ctrl', async () => {
    render(<Mail>{handle('app.j', 'app.ctrl', 'app.send')}</Mail>);
    await focus('[data-field="list"]');
    const typed = tap('j');
    tap('h', { ctrlKey: true });
    tap('Enter');
    expect(typed.defaultPrevented).toBe(false);
    expect(calls).toEqual(['app.send']);
  });
});

describe('Escape', () => {
  it('leaves the field, then runs the Surface’s own Escape, then leaves it', async () => {
    const exit = vi.fn();
    render(
      <Mail onExit={exit}>
        {handle('app.escape')}
        <Handle id="list.escape" enabled={false} />
      </Mail>,
    );
    await focus('[data-field="list"]');
    tap('Escape');
    expect(document.activeElement).toBe(pane('list'));
    expect(keyboard.mode).toBe('normal');
    tap('Escape');
    expect(exit).toHaveBeenCalledTimes(1);
    expect(keyboard.active).toBe('app');
    // The app's own Escape runs only now, and at the top it stays.
    tap('Escape');
    expect(calls).toEqual(['app.escape']);
  });

  it('never runs the Escape Action of a Parent', () => {
    render(<Mail>{handle('app.escape')}</Mail>);
    point('reply');
    tap('Escape');
    expect(keyboard.active).toBe('list');
    expect(calls).toEqual([]);
  });

  it('does nothing at the outermost Surface', () => {
    render(<Mail />);
    const event = tap('Escape');
    expect(event.defaultPrevented).toBe(false);
    expect(keyboard.active).toBe('app');
  });

  it('in a palette: clears its query, then closes it, then goes back', async () => {
    function Palette() {
      const [query, setQuery] = useState('abc');
      keys.useAction('palette.clear', () => setQuery(''), {
        enabled: query !== '',
      });
      return (
        <keys.Surface id="palette" data-pane="palette">
          <input data-field="palette" value={query} readOnly />
        </keys.Surface>
      );
    }
    function App() {
      const { active } = keys.useSurface('palette');
      return active ? <Palette /> : null;
    }
    render(
      <Mail>
        <App />
      </Mail>,
    );
    point('list');
    tap('k', { ctrlKey: true });
    await focus('[data-field="palette"]');
    tap('Escape');
    expect(keyboard.active).toBe('palette');
    expect(document.activeElement?.getAttribute('data-field')).toBe('palette');
    expect(
      (host.querySelector('[data-field="palette"]') as HTMLInputElement).value,
    ).toBe('');
    tap('Escape');
    expect(pane('palette')).toBe(null);
    expect(keyboard.active).toBe('list');
  });

  it('with Vim Mode off, leaves only an Isolated Surface', () => {
    const exit = vi.fn();
    render(<Mail on={false} onExit={exit} />);
    point('list');
    tap('Escape');
    expect(exit).not.toHaveBeenCalled();
    expect(keyboard.active).toBe('list');
    act(() => keyboard.enter('palette'));
    tap('Escape');
    expect(keyboard.active).toBe('list');
  });
});

describe('Focus Spots', () => {
  function Spot(props: {
    readonly name: string;
    readonly isDefault?: boolean;
  }) {
    const ref = keys.useFocusSpot('list', props.name, {
      default: props.isDefault === true,
    });
    return <textarea ref={ref} data-field={props.name} />;
  }
  const spots = (
    <>
      <Spot name="composer" isDefault />
      <Spot name="search" />
    </>
  );
  const field = (name: string) =>
    host.querySelector(`[data-field="${name}"]`) as HTMLElement;

  it('take focus back to the default spot, then the one last in, with Vim Mode off too', async () => {
    render(<Mail on={false}>{spots}</Mail>);
    act(() => keyboard.enter('list'));
    await settle();
    expect(document.activeElement).toBe(field('composer'));
    await focus('[data-field="search"]');
    act(() => keyboard.enter('sidebar'));
    await act(async () => (document.activeElement as HTMLElement).blur());
    act(() => keyboard.enter('list'));
    await settle();
    expect(document.activeElement).toBe(field('search'));
  });

  it('take no focus on their own with autoFocus off, only where the user puts it', async () => {
    render(<Mail autoFocus={false}>{spots}</Mail>);
    act(() => keyboard.enter('list'));
    await settle();
    expect(document.activeElement).toBe(document.body);
    await focus('[data-field="search"]');
    act(() => keyboard.enter('sidebar'));
    await act(async () => (document.activeElement as HTMLElement).blur());
    act(() => keyboard.enter('list'));
    await settle();
    expect(document.activeElement).toBe(document.body);
  });

  it('enter their Surface when focused, wherever they are drawn', async () => {
    render(<Mail>{spots}</Mail>);
    await focus('[data-field="search"]');
    expect(keyboard.active).toBe('list');
    expect(keyboard.mode).toBe('insert');
  });

  it('take focus back when an Isolated Surface closes', async () => {
    function Palette() {
      if (!keys.useSurface('palette').active) return null;
      return (
        <keys.Surface id="palette">
          <input data-field="palette" />
        </keys.Surface>
      );
    }
    render(
      <Mail>
        {spots}
        <Palette />
      </Mail>,
    );
    await focus('[data-field="composer"]');
    tap('k', { ctrlKey: true });
    await focus('[data-field="palette"]');
    tap('Escape');
    await settle();
    expect(keyboard.active).toBe('list');
    expect(document.activeElement).toBe(field('composer'));
  });

  it('take focus out of an Isolated Surface as it is left, before its popup closes', async () => {
    function Popup() {
      const { active } = keys.useSurface('palette');
      const popup = useRef<HTMLDivElement>(null);
      // As a dialog does as it closes, when focus inside it is lost.
      useLayoutEffect(() => {
        const at = document.activeElement;
        if (!active && (at === document.body || popup.current?.contains(at)))
          popup.current?.focus();
      }, [active]);
      return (
        <div ref={popup} tabIndex={-1} data-pane="popup">
          {active && (
            <keys.Surface id="palette">
              <input data-field="palette" />
            </keys.Surface>
          )}
        </div>
      );
    }
    render(
      <Mail>
        {spots}
        <Popup />
      </Mail>,
    );
    await focus('[data-field="composer"]');
    tap('k', { ctrlKey: true });
    await focus('[data-field="palette"]');
    tap('Escape');
    await settle();
    expect(keyboard.active).toBe('list');
    expect(document.activeElement).toBe(field('composer'));
  });

  it('take focus back when remounted, though focus rested outside every Surface meanwhile', async () => {
    function Session(props: { readonly id: string }) {
      return <Spot key={props.id} name="composer" isDefault />;
    }
    const outside = document.createElement('button');
    document.body.append(outside);
    render(
      <Mail>
        <Session id="one" />
      </Mail>,
    );
    await focus('[data-field="composer"]');
    // As a closing popup takes focus when the field it was in goes.
    await act(async () => outside.focus());
    render(
      <Mail>
        <Session id="two" />
      </Mail>,
    );
    await act(async () => outside.remove());
    await settle();
    expect(document.activeElement).toBe(field('composer'));
  });

  it('take focus back when remounted while their Surface is Active, never out of another', async () => {
    function Session(props: { readonly id: string }) {
      return <Spot key={props.id} name="composer" isDefault />;
    }
    render(
      <Mail>
        <Session id="one" />
      </Mail>,
    );
    await focus('[data-field="composer"]');
    const old = field('composer');
    render(
      <Mail>
        <Session id="two" />
      </Mail>,
    );
    await settle();
    expect(field('composer')).not.toBe(old);
    expect(document.activeElement).toBe(field('composer'));
    point('sidebar');
    render(
      <Mail>
        <Session id="three" />
      </Mail>,
    );
    await settle();
    expect(keyboard.active).toBe('sidebar');
    expect(document.activeElement).not.toBe(field('composer'));
  });

  it('give way to the Surface itself after Escape leaves the field', async () => {
    render(<Mail>{spots}</Mail>);
    await focus('[data-field="composer"]');
    tap('Escape');
    expect(document.activeElement).toBe(pane('list'));
    act(() => keyboard.enter('sidebar'));
    await settle();
    act(() => keyboard.enter('list'));
    await settle();
    expect(document.activeElement).toBe(pane('list'));
  });
});

describe('checkBindings', () => {
  it('says which Actions are Shadowed by a nearer Surface, and never climbs out of an Isolated one', () => {
    expect(keys.checkBindings({}, { mac: false })).toEqual({
      conflicts: [],
      shadowed: [
        { id: 'app.x', by: 'sidebar.x', keys: 'x' },
        { id: 'app.e', by: 'list.e', keys: 'e' },
      ],
      invalid: [],
    });
  });

  it('says which Actions would Conflict on one Surface, as the platform reads mod', () => {
    expect(
      keys.checkBindings({ 'app.x': 'e' }, { mac: false }).conflicts,
    ).toEqual([{ id: 'app.x', with: 'app.e', surface: 'app', keys: 'e' }]);
    const ctrlK = { 'app.ctrl': 'ctrl+k' } as const;
    expect(keys.checkBindings(ctrlK, { mac: false }).conflicts).toEqual([
      { id: 'app.ctrl', with: 'app.palette', surface: 'app', keys: 'ctrl+k' },
    ]);
    expect(keys.checkBindings(ctrlK, { mac: true }).conflicts).toEqual([]);
  });

  it('reports what cannot work instead of throwing', () => {
    const check = keys.checkBindings(
      // @ts-expect-error: no such Action
      { 'app.nope': 'x', 'app.j': 'cmd+j', 'app.x': 'j' },
      { mac: false },
    );
    expect(check.invalid.map((each) => each.id)).toEqual(['app.nope', 'app.j']);
    expect(check.conflicts).toEqual([]);
  });
});

describe('hooks', () => {
  it('throw outside their keys.Provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Handle id="app.j" />)).toThrow(
      /inside its keys.Provider/,
    );
  });
});
