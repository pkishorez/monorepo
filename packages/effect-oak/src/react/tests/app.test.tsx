// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import type { Root as ReactRoot } from 'react-dom/client';
import { prerender } from 'react-dom/static';
import { Effect, Layer, Schema } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Actor, History, Replay, Runtime } from '../../core/index.ts';
import type { SavedHistory } from '../../core/index.ts';
import { View, toReact } from '../index.ts';
import { registry } from '../registry.ts';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/*
 * The app before it runs: drawn from its Log on a server and in a browser,
 * hydrated, then taken over by the Runtime; and carried across mounts and
 * hot reloads by the registry.
 */

const Counter = Actor.make('Counter', {
  model: Schema.Struct({ count: Schema.Number }),
  message: Schema.TaggedUnion({ Bumped: {} }),
}).build({
  init: () => ({ model: { count: 0 } }),
  on: { Bumped: (_, { model }) => ({ model: { count: model.count + 1 } }) },
});

let sends: Record<string, (message: { _tag: 'Bumped' }) => void> = {};
const CounterView = View.make(Counter, (self) => {
  sends[self.id] = self.send;
  return <output>{self.model.count}</output>;
});

/** A History of `n` Bumps, as a Runtime leaves it. */
const bumped = (n: number): Promise<SavedHistory> =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const app = yield* Runtime.start(Counter);
        for (let i = 0; i < n; i++) app.send('Counter', { _tag: 'Bumped' });
        return app.history.save();
      }),
    ),
  );

const tick = () => act(() => new Promise((done) => setTimeout(done, 0)));

/** Wait until the Runtime has started: a Send is handled. */
const started = async (host: HTMLElement) => {
  for (let tries = 0; tries < 50; tries++) {
    const before = host.textContent;
    await act(() => sends['Counter']!({ _tag: 'Bumped' }));
    if (host.textContent !== before) return;
    await tick();
  }
  throw new Error('the Runtime never started');
};

let host: HTMLDivElement;
let root: ReactRoot | undefined;

beforeEach(() => {
  registry.clear();
  sends = {};
  host = document.createElement('div');
  document.body.append(host);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  host.remove();
  vi.restoreAllMocks();
});

describe('the first draw', () => {
  it('draws init on the first render, before the Runtime', async () => {
    const App = toReact(Counter, CounterView, Layer.empty);
    root = createRoot(host);
    act(() => root!.render(<App />));
    expect(host.textContent).toBe('0');
    await started(host);
    expect(host.textContent).toBe('1');
  });

  it('draws a saved Log at its Head, through Suspense', async () => {
    const App = toReact(Counter, CounterView, Layer.empty, {
      saved: await bumped(3),
    });
    root = createRoot(host);
    await act(async () => root!.render(<App fallback="…" />));
    expect(host.textContent).toBe('3');
    await started(host);
    expect(host.textContent).toBe('4');
  });

  it('draws a History of one Restore', async () => {
    const state = await bumped(5);
    const snapshot = Replay.fold(Counter.definition, state.entries);
    const App = toReact(Counter, CounterView, Layer.empty, {
      saved: History.restored(Counter, snapshot, 500).save(),
    });
    root = createRoot(host);
    await act(async () => root!.render(<App />));
    expect(host.textContent).toBe('5');
    expect(App.useRuntime).toBeDefined();
  });

  it('drops a Send before the Runtime starts', () => {
    const App = toReact(Counter, CounterView, Layer.empty);
    root = createRoot(host);
    act(() => root!.render(<App />));
    act(() => sends['Counter']!({ _tag: 'Bumped' }));
    expect(host.textContent).toBe('0');
  });
});

describe('on a server', () => {
  const html = async (node: React.ReactNode) => {
    const { prelude } = await prerender(node);
    let out = '';
    const reader = prelude.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return out;
      out += decoder.decode(value);
    }
  };

  it('renders init with no Log', async () => {
    const App = toReact(Counter, CounterView, Layer.empty);
    expect(await html(<App />)).toContain('<output>0</output>');
  });

  it('renders a saved Log at its Head, and the client hydrates it', async () => {
    const App = toReact(Counter, CounterView, Layer.empty, {
      saved: await bumped(7),
    });
    const served = await html(<App />);
    expect(served).toContain('<output>7</output>');

    host.innerHTML = served;
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    await act(async () => {
      root = hydrateRoot(host, <App />);
    });
    expect(host.textContent).toBe('7');
    // Only the server and client renderers sharing one process is noted.
    const about = errors.mock.calls.map((call) => String(call[0]));
    expect(about.filter((e) => !e.includes('multiple renderers'))).toEqual([]);
    await started(host);
    expect(host.textContent).toBe('8');
  });
});

describe('useRuntime before the Runtime', () => {
  it('reads the saved Log on a server, drawn before the app', async () => {
    const App = toReact(Counter, CounterView, Layer.empty, {
      saved: await bumped(3),
    });
    const Probe = () => {
      const { branch, head, running } = App.useRuntime();
      return <i>{`${branch.length}/${head}/${running}`}</i>;
    };
    const { prelude } = await prerender(
      <>
        <Probe />
        <App />
      </>,
    );
    const reader = prelude.getReader();
    let served = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      served += new TextDecoder().decode(value);
    }
    expect(served).toContain('<i>3/2/false</i>');
    expect(served).toContain('<output>3</output>');
  });

  it('reads the saved Log', async () => {
    const App = toReact(Counter, CounterView, Layer.empty, {
      saved: await bumped(2),
    });
    let seen: ReturnType<typeof App.useRuntime> | undefined;
    const Probe = () => {
      seen = App.useRuntime();
      return null;
    };
    root = createRoot(host);
    await act(async () =>
      root!.render(
        <>
          <App />
          <Probe />
        </>,
      ),
    );
    expect(seen?.branch.map((e) => e.message._tag)).toEqual([
      'Bumped',
      'Bumped',
    ]);
    expect(seen?.head).toBe(1);
    expect(seen?.history.snapshotAt(0).model).toEqual({ count: 1 });
    expect(seen?.history.children(null).map((e) => e.id)).toEqual([0]);
  });
});

describe('Time Travel', () => {
  it('shows any Step while the live app runs on, and drops a Send from the past', async () => {
    const App = toReact(Counter, CounterView, Layer.empty, {
      saved: await bumped(4),
    });
    let seen: ReturnType<typeof App.useRuntime> | undefined;
    const Probe = () => {
      seen = App.useRuntime();
      return null;
    };
    root = createRoot(host);
    await act(async () =>
      root!.render(
        <>
          <App />
          <Probe />
        </>,
      ),
    );
    await started(host);
    expect(host.textContent).toBe('5');

    await act(async () => seen!.show(1));
    await tick();
    expect(host.textContent).toBe('2');
    expect(seen?.shown).toBe(1);
    await act(async () => sends['Counter']!({ _tag: 'Bumped' }));
    expect(seen?.head).toBe(4);

    await act(async () => seen!.show(null));
    expect(host.textContent).toBe('5');
    expect(seen?.running).toBe(true);
  });
});

describe('across mounts and hot reloads', () => {
  it('a new app with the same name carries on from the Log the last one left', async () => {
    const First = toReact(Counter, CounterView, Layer.empty);
    root = createRoot(host);
    act(() => root!.render(<First />));
    await started(host);
    await act(() => sends['Counter']!({ _tag: 'Bumped' }));
    expect(host.textContent).toBe('2');
    await act(async () => root!.unmount());

    // The module reloaded: a new Actor with a new rule, and a new toReact.
    const Reloaded = Actor.make('Counter', {
      model: Schema.Struct({ count: Schema.Number }),
      message: Schema.TaggedUnion({ Bumped: {} }),
    }).build({
      init: () => ({ model: { count: 0 } }),
      on: {
        Bumped: (_, { model }) => ({ model: { count: model.count + 10 } }),
      },
    });
    const ReloadedView = View.make(Reloaded, (self) => {
      sends[self.id] = self.send;
      return <output>{self.model.count}</output>;
    });
    const Second = toReact(Reloaded, ReloadedView, Layer.empty);
    root = createRoot(host);
    // Drawn from the old Log through the new code, before the Runtime.
    await act(async () => root!.render(<Second />));
    expect(host.textContent).toBe('20');
    await started(host);
    expect(host.textContent).toBe('30');
  });

  it('mounted again, carries on as it was left', async () => {
    const App = toReact(Counter, CounterView, Layer.empty);
    root = createRoot(host);
    act(() => root!.render(<App />));
    await started(host);
    await act(async () => root!.unmount());
    await tick();

    root = createRoot(host);
    await act(async () => root!.render(<App />));
    expect(host.textContent).toBe('1');
    await started(host);
    expect(host.textContent).toBe('2');
  });

  it('two apps with the same name mounted at once are an error, and the second keeps its own Log', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const One = toReact(Counter, CounterView, Layer.empty);
    const Two = toReact(Counter, CounterView, Layer.empty, {
      saved: await bumped(5),
    });
    const second = document.createElement('div');
    document.body.append(second);
    const one = createRoot(host);
    const two = createRoot(second);
    await act(async () => one.render(<One />));
    await act(async () => two.render(<Two />));
    await tick();
    expect(errors).toHaveBeenCalledWith(
      expect.stringContaining('two apps named Counter'),
    );
    await act(async () => sends['Counter']!({ _tag: 'Bumped' }));
    await tick();
    expect(second.textContent).toBe('6');
    await act(async () => {
      one.unmount();
      two.unmount();
    });
    second.remove();
  });

  it('apps with their own names keep their own Logs', async () => {
    const One = toReact(Counter, CounterView, Layer.empty, { name: 'one' });
    root = createRoot(host);
    act(() => root!.render(<One />));
    await started(host);
    await act(async () => root!.unmount());

    const Two = toReact(Counter, CounterView, Layer.empty, { name: 'two' });
    root = createRoot(host);
    act(() => root!.render(<Two />));
    expect(host.textContent).toBe('0');
  });
});
