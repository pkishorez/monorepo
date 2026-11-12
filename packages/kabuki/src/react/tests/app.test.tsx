// @vitest-environment jsdom
import { StrictMode, act } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import type { Root as ReactRoot } from 'react-dom/client';
import { prerender } from 'react-dom/static';
import { Context, Effect, Layer, Schema } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Actor, History, Runtime, Snapshot } from '../../core/index.ts';
import type { SavedHistory, Step } from '../../core/index.ts';
import { Kabuki, View } from '../index.ts';
import type { AppRuntime, AppSetup } from '../view/index.ts';
import { registry } from '../view/registry.ts';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/*
 * A Runtime or a Step drawn by `<Kabuki>`; and `View.app`, the app before
 * it runs: drawn from its History on a server and in a browser, hydrated,
 * then taken over by the Runtime it makes; carried across mounts and hot
 * reloads by the registry; and Time Travelled, Forked, stopped and started,
 * always on that one Runtime.
 */

const Counter = Actor.define('Counter', {
  model: Schema.Struct({ count: Schema.Number }),
  message: Schema.TaggedUnion({ Bumped: {} }),
}).build({
  init: () => ({ model: { count: 0 } }),
  on: { Bumped: (_, { model }) => ({ model: { count: model.count + 1 } }) },
});

let sends: Record<string, (message: { _tag: 'Bumped' }) => void> = {};
const CounterView = View.make(Counter, (self) => {
  sends[self.address] = self.send;
  return <output>{self.model.count}</output>;
});

/** A Runtime of Counter, Bumped `n` times. */
const bumping = (n: number) => {
  const runtime = Runtime.make(Counter);
  for (let i = 0; i < n; i++)
    runtime.send(runtime.snapshot.root.address, { _tag: 'Bumped' });
  return runtime;
};

/** A History of `n` Bumps, as a Runtime leaves it. */
const bumped = async (n: number): Promise<SavedHistory> => {
  const runtime = bumping(n);
  await runtime.dispose();
  return History.save(Counter, runtime.history);
};

/** A History of one Restore at `n` Bumps, at Time `at`, as a server makes one. */
const restoredAt = async (n: number, at = 100) =>
  History.save(
    Counter,
    History.restored(
      Snapshot.replay(Counter, History.load(Counter, await bumped(n))),
      { at },
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
  localStorage.clear();
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

describe('its Layer', () => {
  class Clock extends Context.Service<
    Clock,
    { readonly now: Effect.Effect<number> }
  >()('test/Clock') {}
  const Timed = Actor.define('Timed', { requires: [Clock] }).build({
    workers: { tick: { run: () => Effect.flatMap(Clock, () => Effect.never) } },
  });
  const TimedView = View.make(Timed, () => null);
  const clock = Layer.succeed(Clock, { now: Effect.succeed(0) });

  it('is asked for once the tree Requires something, and only then', () => {
    View.app(CounterView);
    View.app(TimedView, { layer: clock });
    // @ts-expect-error the tree Requires Clock: a Layer must give it
    View.app(TimedView);
    // @ts-expect-error a Layer that gives nothing leaves Clock missing
    View.app(TimedView, { layer: Layer.empty });
    const promised: AppSetup<Clock> = {};
    // @ts-expect-error a Layer that may be missing gives nothing for sure
    View.app(TimedView, promised);
    expect(true).toBe(true);
  });
});

describe('the first draw', () => {
  it('draws init on the first render, before the Runtime', async () => {
    const App = View.app(CounterView);
    root = createRoot(host);
    act(() => root!.render(<App />));
    expect(host.textContent).toBe('0');
    await started(host);
    expect(host.textContent).toBe('1');
  });

  it('draws a saved History at its Head, through Suspense', async () => {
    const App = View.app(CounterView, { saved: await bumped(3) });
    root = createRoot(host);
    await act(async () => root!.render(<App fallback="…" />));
    expect(host.textContent).toBe('3');
    await started(host);
    expect(host.textContent).toBe('4');
  });

  it('draws a History of one Restore', async () => {
    const App = View.app(CounterView, { saved: await restoredAt(5, 500) });
    root = createRoot(host);
    await act(async () => root!.render(<App />));
    expect(host.textContent).toBe('5');
    expect(App.useRuntime).toBeDefined();
  });

  it('drops a Send before the Runtime starts', () => {
    const App = View.app(CounterView);
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

  it('renders init with no History', async () => {
    const App = View.app(CounterView);
    expect(await html(<App />)).toContain('<output>0</output>');
  });

  it('renders a saved History at its Head, and the client hydrates it', async () => {
    const App = View.app(CounterView, { saved: await bumped(7) });
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

describe('a History given when drawn', () => {
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

  it('a server draws each request its own, at once, in one process', async () => {
    const App = View.app(CounterView);
    const [three, seven] = await Promise.all([
      html(<App saved={await bumped(3)} />),
      html(<App saved={await restoredAt(7)} />),
    ]);
    expect(three).toContain('<output>3</output>');
    expect(seven).toContain('<output>7</output>');
    // The app's own History is left as it was.
    expect(await html(<App />)).toContain('<output>0</output>');
    expect(registry.history('Counter')).toBeUndefined();
  });

  it('a History of one Restore is drawn on the first render, without suspending', () => {
    return restoredAt(5).then((saved) => {
      const App = View.app(CounterView);
      root = createRoot(host);
      act(() => root!.render(<App saved={saved} fallback="…" />));
      expect(host.textContent).toBe('5');
    });
  });

  it.each([
    ['a Branch to replay', () => bumped(4), 4],
    ['one Restore', () => restoredAt(4), 4],
  ])(
    'the browser hydrates %s as the server drew it, then the Runtime starts from it',
    async (_, make, count) => {
      const App = View.app(CounterView);
      const saved = await make();
      const served = await html(<App saved={saved} />);
      expect(served).toContain(`<output>${count}</output>`);

      // The browser reads its own copy, as Start's Scripts send it.
      const sent = JSON.parse(JSON.stringify(saved)) as SavedHistory;
      host.innerHTML = served;
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
      await act(async () => {
        root = hydrateRoot(host, <App saved={sent} />);
      });
      expect(host.textContent).toBe(`${count}`);
      const about = errors.mock.calls.map((call) => String(call[0]));
      expect(about.filter((e) => !e.includes('multiple renderers'))).toEqual(
        [],
      );
      await started(host);
      expect(host.textContent).toBe(`${count + 1}`);
      expect(History.line(registry.history('Counter')!).length).toBe(
        saved.entries.length + 1,
      );
    },
  );

  it('is not taken over a History the app already has, as after a hot reload', async () => {
    const App = View.app(CounterView);
    root = createRoot(host);
    act(() => root!.render(<App />));
    await started(host);
    await act(async () => root!.unmount());

    root = createRoot(host);
    await act(async () => root!.render(<App saved={await bumped(9)} />));
    expect(host.textContent).toBe('1');
  });
});

describe('useRuntime', () => {
  it('has no Runtime on a server, where the app is only drawn', async () => {
    const App = View.app(CounterView, { saved: await bumped(3) });
    const Probe = () => {
      const { runtime, seeking } = App.useRuntime();
      return <i>{`${runtime === null}/${seeking === null}`}</i>;
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
    expect(served).toContain('<i>true/true</i>');
    expect(served).toContain('<output>3</output>');
  });

  it('reads the Runtime made on the saved History', async () => {
    const App = View.app(CounterView, { saved: await bumped(2) });
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
    await tick();
    const history = seen!.runtime!.history;
    expect(History.line(history).map((e) => e.message._tag)).toEqual([
      'Bumped',
      'Bumped',
    ]);
    expect(history.head).toBe(1);
    expect(Snapshot.replay(Counter, history, 0).root.model).toEqual({
      count: 1,
    });
    expect(History.children(history, null).map((e) => e.id)).toEqual([0]);
  });
});

/** Mount `App` with a probe of its `useRuntime`, and wait for its Runtime. */
const probed = async <A,>(App: {
  (props: object): React.ReactNode;
  useRuntime: () => AppRuntime<A>;
}) => {
  let seen: AppRuntime<A> | undefined;
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
  await tick();
  return () => seen!;
};

describe('Time Travel', () => {
  it('draws a Step Sought while the Runtime runs on, and drops a Send from the past', async () => {
    const App = View.app(CounterView, { saved: await bumped(4) });
    const seen = await probed(App);
    await started(host);
    expect(host.textContent).toBe('5');
    const runtime = seen().runtime!;

    await act(async () => seen().seek(1));
    await tick();
    expect(host.textContent).toBe('2');
    expect(seen().seeking).toMatchObject({ entry: 1 });
    expect(seen().runtime).toBe(runtime);
    await act(async () => sends['Counter']!({ _tag: 'Bumped' }));
    expect(seen().runtime!.history.head).toBe(4);
    expect(host.textContent).toBe('2');

    // The Runtime runs on underneath, and the past stays as it was.
    await act(async () =>
      seen().runtime!.send(seen().runtime!.snapshot.root.address, {
        _tag: 'Bumped',
      }),
    );
    expect(host.textContent).toBe('2');

    await act(async () => seen().toHead());
    expect(host.textContent).toBe('6');
    expect(seen().seeking).toBe(null);
    expect(seen().runtime).toBe(runtime);
    expect(runtime.running).toBe(true);
  });

  it('seeks init, as runtime.seek(null) does, and toHead draws the Head again', async () => {
    const App = View.app(CounterView, { saved: await bumped(4) });
    const seen = await probed(App);
    await started(host);
    expect(host.textContent).toBe('5');

    await act(async () => seen().seek(null));
    await tick();
    expect(seen().seeking).toMatchObject({ entry: null, at: 0 });
    expect(seen().seeking!.snapshot).toEqual(
      seen().runtime!.seek(null).snapshot,
    );
    expect(host.textContent).toBe('0');
    await act(async () => sends['Counter']!({ _tag: 'Bumped' }));
    expect(seen().runtime!.history.head).toBe(4);

    await act(async () => seen().toHead());
    expect(seen().seeking).toBe(null);
    expect(host.textContent).toBe('5');
  });

  it('a Seek to an entry not in the History is logged and kept as the failure', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const App = View.app(CounterView);
    const seen = await probed(App);
    await started(host);
    await act(async () => seen().seek(99));
    expect(ours(errors)[0]).toContain('Counter could not seek 99');
    expect(seen().seeking).toBe(null);
    await act(async () => seen().seek(0));
    await tick();
    expect(seen().failure).toBe(null);
    expect(seen().seeking?.entry).toBe(0);
  });

  it('a Step Sought keeps its Snapshot after the Runtime Compacts it away', async () => {
    const App = View.app(CounterView, { saved: await bumped(4) });
    const seen = await probed(App);
    await started(host);
    await act(async () => seen().seek(1));
    await tick();
    expect(host.textContent).toBe('2');

    await act(async () => seen().runtime!.keep(2));
    await tick();
    expect(seen().seeking?.entry).toBe(1);
    expect(host.textContent).toBe('2');
    expect(History.line(seen().runtime!.history).map((e) => e.id)).toEqual([
      3, 4,
    ]);
  });
});

describe('the Window', () => {
  it('is remembered by name and outlasts a reload, over the one given in code', async () => {
    const First = View.app(CounterView, { name: 'kept', window: 10 });
    const seen = await probed(First);
    expect(seen().runtime!.window).toBe(10);
    expect(localStorage.getItem('@kestack/kabuki:kept:window')).toBeNull();
    await act(async () => seen().runtime!.keep(3));
    expect(localStorage.getItem('@kestack/kabuki:kept:window')).toBe('3');
    await act(async () => root?.unmount());

    // A reload: nothing left in memory, only what the browser kept.
    registry.clear();
    const Again = View.app(CounterView, { name: 'kept', window: 10 });
    const again = await probed(Again);
    expect(again().runtime!.window).toBe(3);

    await act(async () => again().runtime!.keep(null));
    expect(localStorage.getItem('@kestack/kabuki:kept:window')).toBe('all');
  });
});

describe('across mounts and hot reloads', () => {
  it('a new app with the same name carries on from the History the last one left', async () => {
    const First = View.app(CounterView);
    root = createRoot(host);
    act(() => root!.render(<First />));
    await started(host);
    await act(() => sends['Counter']!({ _tag: 'Bumped' }));
    expect(host.textContent).toBe('2');
    await act(async () => root!.unmount());

    // The module reloaded: a new Actor with a new rule, and a new View.app.
    const Reloaded = Actor.define('Counter', {
      model: Schema.Struct({ count: Schema.Number }),
      message: Schema.TaggedUnion({ Bumped: {} }),
    }).build({
      init: () => ({ model: { count: 0 } }),
      on: {
        Bumped: (_, { model }) => ({ model: { count: model.count + 10 } }),
      },
    });
    const ReloadedView = View.make(Reloaded, (self) => {
      sends[self.address] = self.send;
      return <output>{self.model.count}</output>;
    });
    const Second = View.app(ReloadedView);
    root = createRoot(host);
    // Drawn from the old History through the new code, before the Runtime.
    await act(async () => root!.render(<Second />));
    expect(host.textContent).toBe('20');
    await started(host);
    expect(host.textContent).toBe('30');
  });

  it('mounted again, carries on as it was left', async () => {
    const App = View.app(CounterView);
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

  it('a new app with the same name carries on with the Input the History was made with', async () => {
    const From = Actor.define('From', {
      input: Schema.Struct({ start: Schema.Number }),
      model: Schema.Struct({ count: Schema.Number }),
      message: Schema.TaggedUnion({ Bumped: {} }),
    }).build({
      init: ({ start }) => ({ model: { count: start } }),
      on: {
        Bumped: (_, { model }) => ({ model: { count: model.count + 1 } }),
      },
    });
    const FromView = View.make(From, (self) => {
      sends['Counter'] = self.send;
      return <output>{self.model.count}</output>;
    });
    const input = vi.fn(() => ({ start: 5 }));
    const First = View.app(FromView, { input });
    root = createRoot(host);
    act(() => root!.render(<First />));
    expect(host.textContent).toBe('5');
    await act(async () => root!.unmount());
    await tick();

    // Not read again: the History left is played from the Input it was made with.
    const Second = View.app(FromView, { input });
    root = createRoot(host);
    await act(async () => root!.render(<Second />));
    expect(host.textContent).toBe('5');
    await started(host);
    expect(host.textContent).toBe('6');
    await act(async () => root!.unmount());
    await tick();

    const Third = View.app(FromView, { input });
    root = createRoot(host);
    await act(async () => root!.render(<Third />));
    expect(host.textContent).toBe('6');
    expect(input).toHaveBeenCalledOnce();
  });

  it('two apps with the same name mounted at once are an error, and the second keeps its own History', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const One = View.app(CounterView);
    const Two = View.app(CounterView, { saved: await bumped(5) });
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
    const One = View.app(CounterView, { name: 'one' });
    root = createRoot(host);
    act(() => root!.render(<One />));
    await started(host);
    await act(async () => root!.unmount());

    const Two = View.app(CounterView, { name: 'two' });
    root = createRoot(host);
    act(() => root!.render(<Two />));
    expect(host.textContent).toBe('0');
  });
});

/** What @kestack/kabuki logged as an error, without React's own notes. */
const ours = (errors: {
  mock: { calls: ReadonlyArray<ReadonlyArray<unknown>> };
}) =>
  errors.mock.calls
    .map((call) => String(call[0]))
    .filter((message) => message.includes('[@kestack/kabuki]'));

describe('mounting', () => {
  it('starts one Runtime under StrictMode', async () => {
    const App = View.app(CounterView);
    root = createRoot(host);
    await act(async () =>
      root!.render(
        <StrictMode>
          <App />
        </StrictMode>,
      ),
    );
    await started(host);
    await act(async () => sends['Counter']!({ _tag: 'Bumped' }));
    // One Runtime handles each Send once.
    expect(host.textContent).toBe('2');
  });

  it('unmounted while starting, stops the start quietly and leaves the History', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    // A Layer that never finishes building: the start is still under way.
    const App = View.app(CounterView, {
      layer: Layer.effectDiscard(Effect.never),
      saved: await bumped(2),
    });
    root = createRoot(host);
    await act(async () => root!.render(<App />));
    await act(async () => root!.unmount());
    root = undefined;
    await tick();
    expect(ours(errors)).toEqual([]);
    expect(registry.history('Counter')?.head).toBe(1);
  });
});

describe('Attachments', () => {
  it('is called once with the running app, which it reads as it is now, and stopped at the last unmount', async () => {
    const stops: Array<string> = [];
    let held: AppRuntime | undefined;
    let heard = 0;
    const App = View.app(CounterView, {
      attach: [
        (runtime) => {
          held = runtime;
          const unsubscribe = runtime.subscribe(() => heard++);
          return () => {
            unsubscribe();
            stops.push('stopped');
          };
        },
      ],
    });
    root = createRoot(host);
    await act(async () => root!.render(<App />));
    await started(host);
    expect(held?.runtime?.running).toBe(true);
    expect(held?.runtime?.history.head).toBe(0);
    expect(History.line(held!.runtime!.history)).toHaveLength(1);
    expect(heard).toBeGreaterThan(0);
    await act(async () => root!.unmount());
    root = undefined;
    expect(stops).toEqual(['stopped']);
  });

  it('one that throws, starting or stopping, is logged; the app and the others run on', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const stops: Array<string> = [];
    const App = View.app(CounterView, {
      attach: [
        () => {
          throw new Error('no');
        },
        () => () => {
          throw new Error('no');
        },
        () => () => stops.push('kept'),
      ],
    });
    root = createRoot(host);
    await act(async () => root!.render(<App />));
    await started(host);
    expect(host.textContent).toBe('1');
    await act(async () => root!.unmount());
    root = undefined;
    expect(stops).toEqual(['kept']);
    expect(ours(errors)).toEqual([
      '[@kestack/kabuki] Counter could not start an Attachment',
      '[@kestack/kabuki] Counter could not stop an Attachment',
    ]);
  });
});

describe('useRuntime controls', () => {
  it('gives one object, read as it is now, and draws again on each change', async () => {
    const App = View.app(CounterView);
    const each: Array<ReturnType<typeof App.useRuntime>> = [];
    const Probe = () => {
      const app = App.useRuntime();
      each.push(app);
      return <span>{app.runtime?.history.head}</span>;
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
    expect(host.querySelector('span')!.textContent).toBe('0');
    await act(async () => sends['Counter']!({ _tag: 'Bumped' }));
    expect(host.querySelector('span')!.textContent).toBe('1');
    expect(new Set(each).size).toBe(1);
    expect(each[0]!.runtime?.history.head).toBe(1);
  });

  it('stop stops the work and drops each click; start runs it again, on the same Runtime', async () => {
    const App = View.app(CounterView);
    const seen = await probed(App);
    await started(host);
    const runtime = seen().runtime!;
    await act(async () => seen().stop());
    await tick();
    expect(runtime.running).toBe(false);
    await act(async () => sends['Counter']!({ _tag: 'Bumped' }));
    expect(host.textContent).toBe('1');
    expect(runtime.history.head).toBe(0);

    await act(async () => seen().start());
    await tick();
    expect(seen().runtime).toBe(runtime);
    expect(runtime.running).toBe(true);
    expect(seen().failure).toBe(null);
    await act(async () => sends['Counter']!({ _tag: 'Bumped' }));
    expect(host.textContent).toBe('2');
  });

  it('fork moves the same Runtime to a Step and grows a new Branch from it', async () => {
    const App = View.app(CounterView, { saved: await bumped(4) });
    const seen = await probed(App);
    await started(host);
    const runtime = seen().runtime!;
    await act(async () => seen().seek(2));
    await tick();

    await act(async () => seen().fork(seen().seeking!.entry));
    await tick();
    expect(seen().runtime).toBe(runtime);
    expect(runtime.running).toBe(true);
    expect(runtime.history.head).toBe(2);
    expect(seen().seeking).toBe(null);
    expect(host.textContent).toBe('3');

    await started(host);
    expect(host.textContent).toBe('4');
    expect(History.children(runtime.history, 2)).toHaveLength(2);
    expect(registry.history('Counter')).toBe(runtime.history);

    // To init: what `clear` was. The old Branches stay.
    await act(async () => seen().fork(null));
    await tick();
    expect(runtime.history.head).toBe(null);
    expect(host.textContent).toBe('0');
    expect(History.tips(runtime.history)).toHaveLength(2);
  });

  it('fork while stopped only moves the Head, and stays stopped', async () => {
    const App = View.app(CounterView, { saved: await bumped(3) });
    const seen = await probed(App);
    await started(host);
    const runtime = seen().runtime!;
    await act(async () => seen().stop());
    await tick();
    await act(async () => seen().fork(0));
    await tick();
    expect(runtime.running).toBe(false);
    expect(runtime.history.head).toBe(0);
    expect(host.textContent).toBe('1');
    await act(async () => sends['Counter']!({ _tag: 'Bumped' }));
    expect(host.textContent).toBe('1');
  });

  it('a Fork from an entry not in the History is logged and kept as the failure', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const App = View.app(CounterView);
    const seen = await probed(App);
    await started(host);
    const runtime = seen().runtime;
    expect(seen().failure).toBe(null);
    await act(async () => seen().fork(99));
    await tick();
    expect(ours(errors)[0]).toContain('Counter could not fork from 99');
    expect(seen().failure?.what).toBe('fork from 99');
    expect(String(seen().failure?.error)).toContain('no History entry 99');
    expect(seen().runtime).toBe(runtime);
    await act(async () => seen().start());
    await tick();
    expect(seen().failure).toBe(null);
    expect(seen().runtime!.running).toBe(true);
  });

  it('a Layer that fails is logged; the app still plays its Sends', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const App = View.app(CounterView, {
      layer: Layer.effectDiscard(Effect.die(new Error('no server'))),
    });
    await probed(App);
    await tick();
    expect(ours(errors)[0]).toContain('no server');
    await started(host);
    expect(host.textContent).toBe('1');
  });
});

describe('<Kabuki>', () => {
  const ButtonView = View.make(Counter, (self) => (
    <button onClick={() => self.send({ _tag: 'Bumped' })}>
      {self.model.count}
    </button>
  ));
  const click = (within: HTMLElement) =>
    act(() => within.querySelector('button')!.click());

  it('draws a Runtime, and a click Sends to it from its View', async () => {
    const runtime = bumping(0);
    root = createRoot(host);
    await act(async () =>
      root!.render(<Kabuki of={runtime} view={ButtonView} />),
    );
    expect(host.textContent).toBe('0');
    await click(host);
    expect(host.textContent).toBe('1');
    expect(History.line(runtime.history).at(-1)?.from).toEqual({
      kind: 'view',
      instance: 'Counter',
    });

    // What is Sent from outside is drawn too.
    await act(async () =>
      runtime.send(runtime.snapshot.root.address, { _tag: 'Bumped' }),
    );
    expect(host.textContent).toBe('2');
    await act(async () => root?.unmount());
    root = undefined;
    await runtime.dispose();
  });

  it('draws a Step, drops its clicks, and the Runtime keeps going', async () => {
    const runtime = bumping(3);
    const past = document.createElement('div');
    document.body.append(past);
    const pastRoot = createRoot(past);
    root = createRoot(host);
    await act(async () => {
      root!.render(<Kabuki of={runtime} view={ButtonView} />);
      pastRoot.render(<Kabuki of={runtime.seek(0)} view={ButtonView} />);
    });
    expect(past.textContent).toBe('1');
    expect(host.textContent).toBe('3');

    await click(past);
    expect(past.textContent).toBe('1');
    expect(runtime.history.head).toBe(2);

    await click(host);
    expect(host.textContent).toBe('4');
    expect(past.textContent).toBe('1');

    await act(async () => pastRoot.unmount());
    past.remove();
    await runtime.dispose();
  });

  it('draws a Step made from a History with no Runtime', () => {
    return bumped(2).then((saved) => {
      const history = History.load(Counter, saved);
      const step: Step<typeof Counter> = {
        entry: 0,
        at: History.entry(history, 0)!.at,
        snapshot: Snapshot.replay(Counter, history, 0),
      };
      root = createRoot(host);
      act(() => root!.render(<Kabuki of={step} view={ButtonView} />));
      expect(host.textContent).toBe('1');
    });
  });

  it('drops a click while the Runtime is stopped', async () => {
    const runtime = bumping(1);
    root = createRoot(host);
    await act(async () =>
      root!.render(<Kabuki of={runtime} view={ButtonView} />),
    );
    await runtime.stop();
    await click(host);
    expect(host.textContent).toBe('1');
    expect(runtime.history.head).toBe(0);
    await act(async () => root?.unmount());
    root = undefined;
    await runtime.dispose();
  });

  it('takes only a View of its Actor', () => {
    const Other = Actor.define('Other', {
      model: Schema.Struct({ on: Schema.Boolean }),
    }).build({ init: () => ({ model: { on: false } }) });
    const OtherView = View.make(Other, () => null);
    const runtime = Runtime.make(Counter);
    // @ts-expect-error a View of another Actor cannot draw this Runtime
    void (<Kabuki of={runtime} view={OtherView} />);
    void runtime.dispose();
  });
});
