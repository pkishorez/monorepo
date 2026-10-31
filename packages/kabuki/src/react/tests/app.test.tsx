// @vitest-environment jsdom
import { StrictMode, act } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import type { Root as ReactRoot } from 'react-dom/client';
import { prerender } from 'react-dom/static';
import { Cause, Context, Effect, Layer, Schema } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Replay } from '../../core/history/replay.ts';
import { Actor, History, Runtime } from '../../core/index.ts';
import { View } from '../index.ts';
import type { SavedHistory } from '../../core/history/index.ts';
import type { AppRuntime } from '../view/index.ts';
import { registry } from '../view/registry.ts';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/*
 * The app before it runs: drawn from its History on a server and in a browser,
 * hydrated, then taken over by the Runtime; and carried across mounts and
 * hot reloads by the registry.
 */

const Counter = Actor.build(
  Actor.define('Counter', {
    model: Schema.Struct({ count: Schema.Number }),
    message: Schema.TaggedUnion({ Bumped: {} }),
  }),
  {
    init: () => ({ model: { count: 0 } }),
    on: { Bumped: (_, { model }) => ({ model: { count: model.count + 1 } }) },
  },
);

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
        const app = yield* Runtime.start(History.make(Counter));
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
  const Timed = Actor.build(Actor.define('Timed', { requires: [Clock] }), {
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
    const state = await bumped(5);
    const snapshot = Replay.fold(Counter.definition, state.entries);
    const App = View.app(CounterView, {
      saved: History.restored(Counter, snapshot, 500).save(),
    });
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

  /** A History of one Restore at `n` Bumps, as a server makes one from its Loaders. */
  const restoredAt = async (n: number) => {
    const state = await bumped(n);
    const snapshot = Replay.fold(Counter.definition, state.entries);
    return History.restored(Counter, snapshot, 100).save();
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
      expect(registry.history('Counter')?.branch().length).toBe(
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

describe('useRuntime before the Runtime', () => {
  it('reads the saved History on a server, drawn before the app', async () => {
    const App = View.app(CounterView, { saved: await bumped(3) });
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

  it('reads the saved History', async () => {
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
    const App = View.app(CounterView, { saved: await bumped(4) });
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

  it('a Step Compacted away shows the oldest one left', async () => {
    const App = View.app(CounterView, { saved: await bumped(4) });
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
    await act(async () => seen!.show(1));
    await tick();
    expect(host.textContent).toBe('2');

    await act(async () => seen!.history.keep(2));
    await tick();
    expect(seen?.shown).toBe(3);
    expect(host.textContent).toBe('4');
    expect(seen?.branch.map((entry) => entry.id)).toEqual([3, 4]);
  });
});

describe('the Window', () => {
  it('is remembered by name and outlasts a reload, over the one given in code', async () => {
    const First = View.app(CounterView, { name: 'kept', window: 10 });
    let seen: ReturnType<typeof First.useRuntime> | undefined;
    const Probe = () => {
      seen = First.useRuntime();
      return null;
    };
    root = createRoot(host);
    await act(async () =>
      root!.render(
        <>
          <First />
          <Probe />
        </>,
      ),
    );
    expect(seen?.history.window()).toBe(10);
    expect(localStorage.getItem('@kestack/kabuki:kept:window')).toBeNull();
    await act(async () => seen!.history.keep(3));
    expect(localStorage.getItem('@kestack/kabuki:kept:window')).toBe('3');
    await act(async () => root?.unmount());

    // A reload: nothing left in memory, only what the browser kept.
    registry.clear();
    const Again = View.app(CounterView, { name: 'kept', window: 10 });
    let again: ReturnType<typeof Again.useRuntime> | undefined;
    const Read = () => {
      again = Again.useRuntime();
      return null;
    };
    root = createRoot(host);
    await act(async () => root!.render(<Read />));
    expect(again?.history.window()).toBe(3);

    await act(async () => again!.history.keep(null));
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
    const Reloaded = Actor.build(
      Actor.define('Counter', {
        model: Schema.Struct({ count: Schema.Number }),
        message: Schema.TaggedUnion({ Bumped: {} }),
      }),
      {
        init: () => ({ model: { count: 0 } }),
        on: {
          Bumped: (_, { model }) => ({ model: { count: model.count + 10 } }),
        },
      },
    );
    const ReloadedView = View.make(Reloaded, (self) => {
      sends[self.id] = self.send;
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
    const From = Actor.build(
      Actor.define('From', {
        input: Schema.Struct({ start: Schema.Number }),
        model: Schema.Struct({ count: Schema.Number }),
        message: Schema.TaggedUnion({ Bumped: {} }),
      }),
      {
        init: ({ start }) => ({ model: { count: start } }),
        on: {
          Bumped: (_, { model }) => ({ model: { count: model.count + 1 } }),
        },
      },
    );
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
    expect(registry.history('Counter')?.head()).toBe(1);
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
    expect(held?.running).toBe(true);
    expect(held?.head).toBe(0);
    expect(held?.branch).toHaveLength(1);
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
  const probed = async (
    App: ReturnType<typeof View.app<typeof Counter, never>>,
  ) => {
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
    return () => seen!;
  };

  it('gives one object, read as it is now, and draws again on each change', async () => {
    const App = View.app(CounterView);
    const each: Array<ReturnType<typeof App.useRuntime>> = [];
    const Probe = () => {
      const runtime = App.useRuntime();
      each.push(runtime);
      return <span>{runtime.head}</span>;
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
    expect(each[0]!.head).toBe(1);
  });

  it('clear forgets the History and goes live from init', async () => {
    const App = View.app(CounterView, { saved: await bumped(3) });
    const seen = await probed(App);
    await started(host);
    expect(host.textContent).toBe('4');
    await act(async () => seen().clear());
    await tick();
    expect(seen().branch).toEqual([]);
    expect(seen().head).toBe(null);
    expect(seen().running).toBe(true);
    expect(host.textContent).toBe('0');
    await started(host);
    expect(host.textContent).toBe('1');
  });

  it('a start that fails is logged and kept as the failure', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const App = View.app(CounterView);
    const seen = await probed(App);
    await started(host);
    expect(seen().failure).toBe(null);
    await act(async () => seen().start(99));
    await tick();
    expect(ours(errors)[0]).toContain('Counter could not start');
    expect(String(seen().failure && Cause.squash(seen().failure!))).toContain(
      'no History entry 99',
    );
    await act(async () => seen().start());
    await tick();
    expect(seen().failure).toBe(null);
    expect(seen().running).toBe(true);
  });

  it('a Runtime that cannot start is logged and kept as the failure', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const App = View.app(CounterView, {
      layer: Layer.effectDiscard(Effect.die(new Error('no server'))),
    });
    const seen = await probed(App);
    await tick();
    expect(seen().running).toBe(false);
    expect(ours(errors)[0]).toContain('no server');
    expect(seen().failure).not.toBe(null);
  });
});
