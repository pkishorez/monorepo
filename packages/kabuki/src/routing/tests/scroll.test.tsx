// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root as ReactRoot } from 'react-dom/client';
import { Effect, Layer, Schema } from 'effect';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { View } from '../../react/index.ts';
import {
  Loading,
  Page,
  Router,
  useElementScrollRestoration,
} from '../index.ts';
import { registry } from '../../react/view/index.ts';
import { KEY } from '../router/adapter/index.ts';
import { browser } from '../router/adapter/browser/index.ts';
import type { ScrollRestorationOptions } from '../router/scroll/index.ts';
import { scriptFor } from '../router/scroll/index.ts';
import { selectorOf } from '../router/scroll/selector.ts';

/*
 * Scroll restoration as TanStack Router does it, drawn in a document on the
 * browser's history: the window and every element scrolled, kept per entry
 * and put back on Back; what stays on the page keeps where it was; what
 * `scrollToTopSelectors` names goes to the top; a move that says
 * `resetScroll: false`; a hash; a key per path; a reload, and the script a
 * server writes for it.
 *
 * jsdom lays nothing out, so every element and the window keep the position
 * they are given, and a user's scroll is a position and a `scroll` event.
 */

const positions = new WeakMap<object, { x: number; y: number }>();
const at = (target: object) => {
  let found = positions.get(target);
  if (!found) positions.set(target, (found = { x: 0, y: 0 }));
  return found;
};
Object.defineProperty(Element.prototype, 'scrollTop', {
  configurable: true,
  get() {
    return at(this).y;
  },
  set(y: number) {
    at(this).y = y;
  },
});
Object.defineProperty(Element.prototype, 'scrollLeft', {
  configurable: true,
  get() {
    return at(this).x;
  },
  set(x: number) {
    at(this).x = x;
  },
});
Element.prototype.scrollTo = function (this: Element, options?: unknown) {
  const { left = 0, top = 0 } = options as { left?: number; top?: number };
  at(this).x = left;
  at(this).y = top;
};
/** The elements scrolled into view, by id, in order. */
let intoView: Array<string> = [];
Element.prototype.scrollIntoView = function (this: Element) {
  intoView.push(this.id);
};
Object.defineProperty(window, 'scrollX', { get: () => at(window).x });
Object.defineProperty(window, 'scrollY', { get: () => at(window).y });
Object.defineProperty(history, 'scrollRestoration', {
  value: 'auto',
  writable: true,
});
window.scrollTo = ((x: unknown, y?: number) => {
  const to =
    typeof x === 'object'
      ? (x as { left?: number; top?: number })
      : { left: x as number, top: y };
  at(window).x = to.left ?? 0;
  at(window).y = to.top ?? 0;
}) as typeof window.scrollTo;

/** The user scrolls an element, or the window, to `y`. */
const scroll = async (target: Element | Window, y: number) => {
  if (target === window) at(window).y = y;
  else (target as Element).scrollTop = y;
  const on = target === window ? document : (target as Element);
  await act(async () => void on.dispatchEvent(new Event('scroll')));
};

const Message = Page.define({
  path: '/:id',
  params: { id: Schema.String },
});
const Folder = Page.define({
  path: '/f/:folder',
  params: { folder: Schema.String },
  pages: { Message },
});
const Slow = Page.define({
  path: '/slow',
  data: Schema.Struct({ text: Schema.String }),
});
const Settings = Page.define({
  path: '/settings',
  query: { tab: Schema.optionalKey(Schema.String) },
  message: Schema.TaggedUnion({ Tabbed: { keep: Schema.Boolean } }),
});
const App = Page.define({ pages: { Folder, Settings, Slow } });
/** The Routes the pages link to; each test draws a router of its own, with its scroll options. */
const Routes = Router.define(App);

const MessageLive = Page.build(Message);
/** What each message read of its pane's kept position, in each render, in order. */
let readKept: Array<string> = [];
const MessageView = View.make(MessageLive, ({ props }) => {
  const kept = useElementScrollRestoration({ id: 'pane' });
  readKept.push(`${props.params.id} ${kept?.scrollY ?? 'none'}`);
  return <Pane id={props.params.id} />;
});
const Pane = ({ id }: { readonly id: string }) => (
  <article id="pane" data-scroll-restoration-id="pane">
    message {id}
    <h2 id="part-2">part two</h2>
    <Router.Link to={Routes.Folder.Message({ folder: 'inbox', id: 'b' })}>
      b
    </Router.Link>
  </article>
);

const FolderLive = Page.build(Folder, { pages: { Message: MessageLive } });
const FolderView = View.make(FolderLive, (self) => (
  <section>
    <ul id="list" data-scroll-restoration-id="list">
      <li>
        <Router.Link to={Routes.Folder.Message({ folder: 'inbox', id: 'a' })}>
          a
        </Router.Link>
      </li>
    </ul>
    {self.children.Message && <MessageView instance={self.children.Message} />}
  </section>
));

const SlowLive = Page.build(Slow);
const SlowView = View.make(SlowLive, ({ props }) => (
  <p>{props.status._tag === 'Ready' ? props.status.data.text : 'loading'}</p>
));
/** Holds the slow page's Loader until it is let go. */
let letGo: () => void = () => {};

const SettingsLive = Page.build(Settings, {
  on: {
    Tabbed: ({ keep }) => ({
      command: Router.replace(
        Routes.Settings({ tab: 'two' }),
        keep ? { resetScroll: false } : {},
      ),
    }),
  },
});
const SettingsView = View.make(SettingsLive, ({ send }) => (
  <div>
    settings
    <button onClick={() => send({ _tag: 'Tabbed', keep: false })}>tab</button>
    <button onClick={() => send({ _tag: 'Tabbed', keep: true })}>
      tab, kept
    </button>
    <Router.Link to={Routes.Folder({ folder: 'inbox' })}>inbox</Router.Link>
    <Router.Link to={Routes.Folder({ folder: 'inbox' })} resetScroll={false}>
      inbox, kept
    </Router.Link>
    <Router.Link to={Routes.Slow()}>slow</Router.Link>
    <Router.Link
      to={Routes.Folder.Message({ folder: 'inbox', id: 'a' })}
      hash="part-2"
    >
      part two
    </Router.Link>
  </div>
));

const AppLive = Page.build(App, {
  pages: { Folder: FolderLive, Settings: SettingsLive, Slow: SlowLive },
});
const AppView = View.make(AppLive, (self) => (
  <main id="main">
    <Router.Link to={Routes.Settings()}>to settings</Router.Link>
    {self.children.Folder && <FolderView instance={self.children.Folder} />}
    {self.children.Settings && (
      <SettingsView instance={self.children.Settings} />
    )}
    {self.children.Slow && <SlowView instance={self.children.Slow} />}
  </main>
));
type AnyRoute = typeof Routes.route.Type;

const tick = () => act(() => new Promise((done) => setTimeout(done, 20)));
const settle = async () => {
  for (let i = 0; i < 5; i++) await tick();
};

let host: HTMLDivElement;
let root: ReactRoot | undefined;
let count = 0;
let options: ScrollRestorationOptions<AnyRoute> = {};
/** The app drawn last, to show a past Step of. */
let runtime: { readonly show: (step: number | null) => void } | undefined;

/** Draws the app at the URL shown, on the browser's history: a page load, or a reload. */
const load = async () => {
  await act(async () => root?.unmount());
  registry.clear();
  const routed = Router.define(App, options);
  const Root = Router.app(routed, AppView);
  const Drawn = View.app(Root.view, {
    layer: Layer.mergeAll(
      browser(),
      Loading.memory(routed, {
        Slow: () =>
          Effect.promise(
            () => new Promise<void>((done) => (letGo = done)),
          ).pipe(Effect.as({ text: 'slow, there' })),
      }),
    ) as Layer.Layer<never>,
    name: `scroll-${count++}`,
    input: Root.startAt,
  });
  const Probe = () => {
    runtime = Drawn.useRuntime();
    return null;
  };
  root = createRoot(host);
  await act(async () =>
    root!.render(
      <>
        <Drawn />
        <Probe />
      </>,
    ),
  );
  await settle();
};
const open = async (
  url: string,
  given: ScrollRestorationOptions<AnyRoute> = { scrollRestoration: true },
) => {
  options = given;
  history.replaceState(null, '', url);
  await load();
};
const click = async (text: string) => {
  const link = [...host.querySelectorAll('a')].find(
    (each) => each.textContent?.trim() === text,
  )!;
  await act(
    async () =>
      void link.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
      ),
  );
  await settle();
};
const press = async (text: string) => {
  const button = [...host.querySelectorAll('button')].find(
    (each) => each.textContent?.trim() === text,
  )!;
  await act(async () => button.click());
  await settle();
};
const back = async () => {
  await act(async () => history.back());
  await settle();
};
const top = (selector: string) => document.querySelector(selector)!.scrollTop;

beforeEach(() => {
  sessionStorage.clear();
  window.scrollTo(0, 0);
  intoView = [];
  host = document.createElement('div');
  document.body.append(host);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  host.remove();
});

describe('the window', () => {
  it('is left to the browser unless the Router says scrollRestoration', async () => {
    await open('/settings', {});
    await scroll(window, 300);
    await click('inbox');
    expect(scrollY).toBe(300);
    expect(history.scrollRestoration).toBe('auto');
  });

  it('goes to the top on a new entry, and back where it was on Back', async () => {
    await open('/settings');
    expect(history.scrollRestoration).toBe('manual');
    await scroll(window, 300);
    await click('inbox');
    expect(scrollY).toBe(0);

    await back();
    expect(host.textContent).toContain('settings');
    expect(scrollY).toBe(300);
  });

  it('goes to the top as the move lands, before the new page has its data', async () => {
    await open('/settings');
    await scroll(window, 300);
    await click('slow');
    await act(() => new Promise((done) => setTimeout(done, 200)));
    expect(host.textContent).toContain('loading');
    expect(scrollY).toBe(0);
    await act(async () => letGo());
    // A loading screen stays at least 300 ms.
    await act(() => new Promise((done) => setTimeout(done, 400)));
    expect(host.textContent).toContain('slow, there');
    expect(scrollY).toBe(0);
  });

  it('goes to the top on a replace, a new entry in the place of the one shown', async () => {
    await open('/settings');
    const before = history.state[KEY];
    await scroll(window, 300);
    await press('tab');
    expect(location.search).toBe('?tab=two');
    expect(history.state[KEY]).not.toBe(before);
    expect(scrollY).toBe(0);
  });

  it('is left as it is by a replace that says resetScroll: false', async () => {
    await open('/settings');
    await scroll(window, 300);
    await press('tab, kept');
    expect(location.search).toBe('?tab=two');
    expect(scrollY).toBe(300);
  });

  it('is left as it is by a move that says resetScroll: false', async () => {
    await open('/settings');
    await scroll(window, 300);
    await click('inbox, kept');
    expect(host.querySelector('#list')).not.toBeNull();
    expect(scrollY).toBe(300);
  });

  it('is kept per path when getScrollRestorationKey says so: a plain link finds it', async () => {
    await open('/settings', {
      scrollRestoration: true,
      getScrollRestorationKey: ({ path }) => path,
    });
    await scroll(window, 300);
    await click('inbox');
    expect(scrollY).toBe(0);
    await click('to settings');
    expect(scrollY).toBe(300);
  });
});

describe('an element', () => {
  it('still on the page keeps where it was on a new entry, and Back puts it back', async () => {
    await open('/f/inbox/a');
    await scroll(host.querySelector('#list')!, 80);
    await click('b');
    expect(host.textContent).toContain('message b');
    expect(top('#list')).toBe(80);

    await back();
    expect(host.textContent).toContain('message a');
    expect(top('#list')).toBe(80);

    // The new entry kept what it started from: Forward puts that back.
    await scroll(host.querySelector('#list')!, 10);
    await act(async () => history.forward());
    await settle();
    expect(host.textContent).toContain('message b');
    expect(top('#list')).toBe(80);
  });

  it('that scrollToTopSelectors names goes to the top on a new entry, and back on Back', async () => {
    await open('/f/inbox/a', {
      scrollRestoration: true,
      scrollToTopSelectors: ['#pane'],
    });
    await scroll(host.querySelector('#pane')!, 200);
    await click('b');
    expect(top('#pane')).toBe(0);

    await back();
    expect(top('#pane')).toBe(200);
  });

  it('reads what its entry kept in the render that lands the move', async () => {
    await open('/f/inbox/a', {
      scrollRestoration: true,
      scrollToTopSelectors: ['#pane'],
    });
    await scroll(host.querySelector('#pane')!, 200);
    await click('b');
    readKept = [];
    await back();
    expect(readKept[0]).toBe('a 200');
  });

  it('is named by its data-scroll-restoration-id, else by its path', () => {
    const list = document.createElement('ul');
    list.setAttribute('data-scroll-restoration-id', 'list');
    const plain = document.createElement('div');
    host.append(list, plain);
    expect(selectorOf(list)).toBe('[data-scroll-restoration-id="list"]');
    expect(selectorOf(plain)).toMatch(/^html:nth-child\(1\) > body:nth-child/);
    expect(document.querySelector(selectorOf(plain))).toBe(plain);
  });
});

describe('a hash', () => {
  it('scrolls its element into view on a push, and Back restores the window', async () => {
    await open('/settings');
    await scroll(window, 300);
    await click('part two');
    expect(location.hash).toBe('#part-2');
    expect(intoView).toEqual(['part-2']);

    await back();
    expect(scrollY).toBe(300);
  });
});

describe('a reload', () => {
  it('starts from the tab’s session storage, and Back to an entry from before it too', async () => {
    await open('/settings');
    await scroll(window, 300);
    await click('inbox');
    await scroll(window, 120);
    await load();
    expect(scrollY).toBe(120);

    await back();
    expect(host.textContent).toContain('settings');
    expect(scrollY).toBe(300);
  });

  it('is put back before the app hydrates by the script a server writes', () => {
    expect(Router.app(Routes, AppView).restoreScroll(Routes.Settings())).toBe(
      null,
    );
    const script = Router.app(
      Router.define(App, { scrollRestoration: true }),
      AppView,
    ).restoreScroll(Routes.Settings())!;
    host.innerHTML = '<div id="pane"></div>';
    sessionStorage.setItem(
      '@kestack/kabuki/routing:scroll',
      JSON.stringify({
        'k.1': {
          window: { scrollX: 0, scrollY: 500 },
          [selectorOf(host.firstElementChild!)]: { scrollX: 0, scrollY: 40 },
        },
      }),
    );
    history.replaceState({ [KEY]: 'k.1' }, '', '/settings');
    new Function(script)();
    expect(scrollY).toBe(500);
    expect(top('#pane')).toBe(40);

    history.replaceState({ [KEY]: 'k.2' }, '', '/settings#pane');
    new Function(scriptFor(KEY))();
    expect(intoView).toEqual(['pane']);
  });
});

describe('Time Travel', () => {
  it('never moves the window to a past Step', async () => {
    await open('/settings');
    await scroll(window, 300);
    await click('inbox');
    expect(scrollY).toBe(0);

    await act(async () => runtime!.show(1));
    await settle();
    expect(host.textContent).toContain('settings');
    expect(scrollY).toBe(0);

    await act(async () => runtime!.show(null));
    await settle();
    expect(scrollY).toBe(0);
  });
});
