// @vitest-environment jsdom
import { act, Component, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KeysProvider, sequence, shortcut } from '../../core/index.ts';
import { useSequence, useShortcut } from '../index.ts';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const key = (
  type: 'keydown' | 'keyup',
  target: Element,
  init: KeyboardEventInit,
) => {
  const event = new KeyboardEvent(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    ...init,
  });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
};

const tap = (target: Element, init: KeyboardEventInit) => {
  const down = key('keydown', target, init);
  key('keyup', target, init);
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
});

const render = (node: ReactNode) => act(() => root.render(node));

function Shortcut(props: {
  readonly keys: Parameters<typeof useShortcut>[0];
  readonly onCommit: () => void;
  readonly options?: Parameters<typeof useShortcut>[2];
}) {
  useShortcut(props.keys, props.onCommit, props.options);
  return null;
}

function Sequence(props: {
  readonly keys: Parameters<typeof useSequence>[0];
  readonly onCommit: () => void;
  readonly onCancel?: (reason: string) => void;
}) {
  const { pending } = useSequence(
    props.keys,
    props.onCommit,
    props.onCancel ? { onCancel: props.onCancel } : {},
  );
  return <span data-testid="pending">{String(pending)}</span>;
}

class Catch extends Component<
  { readonly children: ReactNode },
  { error?: Error }
> {
  override state: { error?: Error } = {};
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override render() {
    return this.state.error ? (
      <p data-testid="error">{this.state.error.message}</p>
    ) : (
      this.props.children
    );
  }
}

describe('useShortcut', () => {
  it('commits and Takes its key', () => {
    const onCommit = vi.fn();
    render(
      <KeysProvider>
        <Shortcut
          keys={[shortcut('j'), shortcut('ArrowDown')]}
          onCommit={onCommit}
        />
      </KeysProvider>,
    );
    expect(
      tap(document.body, { key: 'j', code: 'KeyJ' }).defaultPrevented,
    ).toBe(true);
    tap(document.body, { key: 'ArrowDown', code: 'ArrowDown' });
    expect(onCommit).toHaveBeenCalledTimes(2);
    expect(
      tap(document.body, { key: 'x', code: 'KeyX' }).defaultPrevented,
    ).toBe(false);
  });

  it('takes a Shortcut written as a string', () => {
    const onCommit = vi.fn();
    render(
      <KeysProvider>
        <Shortcut keys="ctrl+k" onCommit={onCommit} />
      </KeysProvider>,
    );
    tap(document.body, { key: 'k', code: 'KeyK', ctrlKey: true });
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('matches exact modifiers, Caps Lock aside', () => {
    const onCommit = vi.fn();
    render(
      <KeysProvider>
        <Shortcut keys={{ key: 'k', ctrl: true }} onCommit={onCommit} />
      </KeysProvider>,
    );
    tap(document.body, { key: 'k', code: 'KeyK' });
    expect(onCommit).not.toHaveBeenCalled();
    key('keydown', document.body, {
      key: 'Control',
      code: 'ControlLeft',
      ctrlKey: true,
    });
    tap(document.body, { key: 'K', code: 'KeyK', ctrlKey: true });
    key('keyup', document.body, { key: 'Control', code: 'ControlLeft' });
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('leaves Text Entry its keys, and Escape leaves it', () => {
    const plain = vi.fn();
    const palette = vi.fn();
    render(
      <KeysProvider>
        <Shortcut keys="j" onCommit={plain} />
        <Shortcut
          keys={{ key: 'k', ctrl: true }}
          onCommit={palette}
          options={{ inTextEntry: true }}
        />
        <Shortcut keys="Escape" onCommit={plain} />
        <input />
      </KeysProvider>,
    );
    const input = host.querySelector('input') as HTMLInputElement;
    input.focus();
    expect(tap(input, { key: 'j', code: 'KeyJ' }).defaultPrevented).toBe(false);
    tap(input, { key: 'k', code: 'KeyK', ctrlKey: true });
    expect(palette).toHaveBeenCalledTimes(1);
    tap(input, { key: 'Escape', code: 'Escape' });
    expect(document.activeElement).not.toBe(input);
    expect(plain).not.toHaveBeenCalled();
  });

  it('hears a data-keys="enabled" element first and never a disabled one', () => {
    const onCommit = vi.fn();
    const onInput = vi.fn();
    render(
      <KeysProvider>
        <Shortcut keys="ArrowDown" onCommit={onCommit} />
        <input data-keys="enabled" onKeyDown={onInput} />
        <div data-keys="disabled">
          <button type="button" />
        </div>
      </KeysProvider>,
    );
    const input = host.querySelector('input') as HTMLInputElement;
    tap(input, { key: 'ArrowDown', code: 'ArrowDown' });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onInput).not.toHaveBeenCalled();
    tap(host.querySelector('button') as Element, {
      key: 'ArrowDown',
      code: 'ArrowDown',
    });
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('leaves a key a component already used', () => {
    const onCommit = vi.fn();
    render(
      <KeysProvider>
        <Shortcut keys="j" onCommit={onCommit} />
        <div tabIndex={-1} onKeyDown={(event) => event.preventDefault()} />
      </KeysProvider>,
    );
    tap(host.querySelector('div') as Element, { key: 'j', code: 'KeyJ' });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('repeats only when asked, at the provider timing, ignoring the browser', () => {
    const once = vi.fn();
    const held = vi.fn();
    render(
      <KeysProvider repeat={{ delay: 300, interval: 50 }}>
        <Shortcut keys="j" onCommit={held} options={{ repeat: true }} />
        <Shortcut keys="s" onCommit={once} />
      </KeysProvider>,
    );
    key('keydown', document.body, { key: 'j', code: 'KeyJ' });
    key('keydown', document.body, { key: 'j', code: 'KeyJ', repeat: true });
    expect(held).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(300 + 50 * 2));
    expect(held).toHaveBeenCalledTimes(4);
    key('keyup', document.body, { key: 'j', code: 'KeyJ' });
    act(() => vi.advanceTimersByTime(500));
    expect(held).toHaveBeenCalledTimes(4);
    key('keydown', document.body, { key: 's', code: 'KeyS' });
    act(() => vi.advanceTimersByTime(1000));
    key('keyup', document.body, { key: 's', code: 'KeyS' });
    expect(once).toHaveBeenCalledTimes(1);
  });

  it('throws on a Conflict, naming both', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <KeysProvider>
        <Catch>
          <Shortcut keys="g" onCommit={() => {}} />
          <Sequence keys={sequence('g g')} onCommit={() => {}} />
        </Catch>
      </KeysProvider>,
    );
    expect(host.textContent).toContain('"g g" conflicts with "g"');
  });

  it('throws outside a KeysProvider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <Catch>
        <Shortcut keys="g" onCommit={() => {}} />
      </Catch>,
    );
    expect(host.textContent).toContain(
      'useShortcut must be used inside a KeysProvider',
    );
  });
});

describe('useSequence', () => {
  it('is pending after its first step and commits on its last', () => {
    const onCommit = vi.fn();
    render(
      <KeysProvider>
        <Sequence
          keys={[sequence('g g'), sequence('g Home')]}
          onCommit={onCommit}
        />
      </KeysProvider>,
    );
    tap(document.body, { key: 'g', code: 'KeyG' });
    expect(host.textContent).toBe('true');
    tap(document.body, { key: 'g', code: 'KeyG' });
    expect(host.textContent).toBe('false');
    tap(document.body, { key: 'g', code: 'KeyG' });
    tap(document.body, { key: 'Home', code: 'Home' });
    expect(onCommit).toHaveBeenCalledTimes(2);
  });

  it('Repeats on its last key, held, when asked', () => {
    const onCommit = vi.fn();
    function Held() {
      useSequence('g g', onCommit, { repeat: true });
      return null;
    }
    render(
      <KeysProvider repeat={{ delay: 300, interval: 50 }}>
        <Held />
      </KeysProvider>,
    );
    tap(document.body, { key: 'g', code: 'KeyG' });
    key('keydown', document.body, { key: 'g', code: 'KeyG' });
    act(() => vi.advanceTimersByTime(300 + 50));
    expect(onCommit).toHaveBeenCalledTimes(3);
    key('keyup', document.body, { key: 'g', code: 'KeyG' });
    act(() => vi.advanceTimersByTime(500));
    expect(onCommit).toHaveBeenCalledTimes(3);
  });

  it('cancels when the next step comes too late, or the page loses focus', () => {
    const onCancel = vi.fn();
    render(
      <KeysProvider sequence={{ timeout: 400 }}>
        <Sequence
          keys={sequence('g i')}
          onCommit={() => {}}
          onCancel={onCancel}
        />
      </KeysProvider>,
    );
    tap(document.body, { key: 'g', code: 'KeyG' });
    act(() => vi.advanceTimersByTime(401));
    expect(onCancel).toHaveBeenLastCalledWith('late');
    expect(host.textContent).toBe('false');
    key('keydown', document.body, { key: 'g', code: 'KeyG' });
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });
    expect(onCancel).toHaveBeenLastCalledWith('interrupted');
  });
});

describe('review fixes', () => {
  it('cancels a Sequence waiting between steps when the page loses focus', () => {
    const onCancel = vi.fn();
    render(
      <KeysProvider>
        <Sequence
          keys={sequence('g i')}
          onCommit={() => {}}
          onCancel={onCancel}
        />
      </KeysProvider>,
    );
    tap(document.body, { key: 'g', code: 'KeyG' });
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });
    expect(onCancel).toHaveBeenCalledWith('interrupted');
    expect(host.textContent).toBe('false');
  });

  it('is no longer pending once turned off', () => {
    const view = (enabled: boolean) => {
      function Pending() {
        const { pending } = useSequence('g i', () => {}, { enabled });
        return <span>{String(pending)}</span>;
      }
      render(
        <KeysProvider>
          <Pending />
        </KeysProvider>,
      );
    };
    view(true);
    tap(document.body, { key: 'g', code: 'KeyG' });
    expect(host.textContent).toBe('true');
    view(false);
    expect(host.textContent).toBe('false');
  });

  it('stops Repeating when another key goes down', () => {
    const held = vi.fn();
    render(
      <KeysProvider repeat={{ delay: 300, interval: 50 }}>
        <Shortcut keys="j" onCommit={held} options={{ repeat: true }} />
      </KeysProvider>,
    );
    key('keydown', document.body, { key: 'j', code: 'KeyJ' });
    key('keydown', document.body, {
      key: 'Control',
      code: 'ControlLeft',
      ctrlKey: true,
    });
    act(() => vi.advanceTimersByTime(1000));
    expect(held).toHaveBeenCalledTimes(1);
  });

  it('Repeats a Shortcut Taken in Text Entry until its key lifts', () => {
    const undo = vi.fn();
    render(
      <KeysProvider repeat={{ delay: 300, interval: 50 }}>
        <Shortcut
          keys={{ key: 'z', ctrl: true }}
          onCommit={undo}
          options={{ inTextEntry: true, repeat: true }}
        />
        <textarea />
      </KeysProvider>,
    );
    const area = host.querySelector('textarea') as HTMLTextAreaElement;
    key('keydown', area, { key: 'z', code: 'KeyZ', ctrlKey: true });
    act(() => vi.advanceTimersByTime(300));
    expect(undo).toHaveBeenCalledTimes(2);
    key('keyup', area, { key: 'z', code: 'KeyZ', ctrlKey: true });
    act(() => vi.advanceTimersByTime(1000));
    expect(undo).toHaveBeenCalledTimes(2);
  });

  it('lets Escape leave a data-keys="enabled" field no Shortcut took it from', () => {
    render(
      <KeysProvider>
        <input data-keys="enabled" />
      </KeysProvider>,
    );
    const input = host.querySelector('input') as HTMLInputElement;
    input.focus();
    tap(input, { key: 'Escape', code: 'Escape' });
    expect(document.activeElement).not.toBe(input);
  });
});
