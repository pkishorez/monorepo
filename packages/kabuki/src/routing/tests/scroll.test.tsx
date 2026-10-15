// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root as ReactRoot } from 'react-dom/client';
import { Layer, Schema } from 'effect';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { toReact } from '../../react/index.ts';
import { registry } from '../../react/registry.ts';
import { browser } from '../adapter/browser/index.ts';
import { Route, Router, useScroll } from '../index.ts';

/*
 * Scroll restoration drawn in a document, on the browser's history: a page's
 * own Scroll areas and the window, put back per entry or per place, a move
 * that says otherwise, a reload, and a page that says never.
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
Element.prototype.scrollTo = function (this: Element, x: unknown, y?: unknown) {
  at(this).x = Number(x);
  at(this).y = Number(y);
};
Object.defineProperty(window, 'scrollX', { get: () => at(window).x });
Object.defineProperty(window, 'scrollY', { get: () => at(window).y });
Object.defineProperty(history, 'scrollRestoration', {
  value: 'auto',
  writable: true,
});
window.scrollTo = ((x: number, y: number) => {
  at(window).x = x;
  at(window).y = y;
}) as typeof window.scrollTo;

/** The user scrolls `target` to `y`. */
const scroll = async (target: Element | Window, y: number) => {
  if (target === window) at(window).y = y;
  else (target as Element).scrollTop = y;
  await act(async () => void target.dispatchEvent(new Event('scroll')));
};

const Message = Route.page({
  path: '/:id',
  params: { id: Schema.String },
  scroll: 'entry',
}).build({});
const MessageView = Route.view(Message, ({ props }) => {
  const pane = useScroll();
  return (
    <article id="pane" ref={pane}>
      message {props.params.id}
      <Router.Link to={Routes.Folder.Message({ folder: 'inbox', id: 'b' })}>
        b
      </Router.Link>
    </article>
  );
});

const Folder = Route.page({
  path: '/f/:folder',
  params: { folder: Schema.String },
  scroll: 'url',
  pages: { Message },
}).build({});
const FolderView = Route.view(Folder, (self) => {
  const list = useScroll();
  return (
    <section>
      <ul id="list" ref={list}>
        <li>
          <Router.Link to={Routes.Folder.Message({ folder: 'inbox', id: 'a' })}>
            a
          </Router.Link>
        </li>
      </ul>
      {self.children.Message && (
        <MessageView instance={self.children.Message} />
      )}
    </section>
  );
});

const Settings = Route.page({ path: '/settings' }).build({});
const SettingsView = Route.view(Settings, () => (
  <main>
    settings
    <Router.Link to={Routes.Folder({ folder: 'inbox' })}>inbox</Router.Link>
    <Router.Link to={Routes.Folder({ folder: 'inbox' })} scroll="keep">
      inbox, kept
    </Router.Link>
  </main>
));

const Canvas = Route.page({ path: '/canvas', scroll: false }).build({});
const CanvasView = Route.view(Canvas, () => {
  const board = useScroll();
  return <div id="board" ref={board} />;
});

const App = Route.page({ pages: { Folder, Settings, Canvas } }).build({});
const AppView = Route.view(App, (self) => (
  <>
    <nav>
      <Router.Link to={Routes.Settings()}>to settings</Router.Link>
      <Router.Link to={Routes.Canvas()}>to canvas</Router.Link>
    </nav>
    {self.children.Folder && <FolderView instance={self.children.Folder} />}
    {self.children.Settings && (
      <SettingsView instance={self.children.Settings} />
    )}
    {self.children.Canvas && <CanvasView instance={self.children.Canvas} />}
  </>
));
const Routes = Route.tree(App);

const tick = () => act(() => new Promise((done) => setTimeout(done, 20)));
const settle = async () => {
  for (let i = 0; i < 5; i++) await tick();
};

let host: HTMLDivElement;
let root: ReactRoot | undefined;
let count = 0;
/** The app drawn last, to show a past Step of. */
let runtime: { readonly show: (step: number | null) => void } | undefined;

/** Draws the app at the URL shown, on the browser's history: a page load, or a reload. */
const load = async () => {
  await act(async () => root?.unmount());
  registry.clear();
  const Root = Router.app(Routes, AppView);
  const Drawn = toReact(
    Root.actor,
    Root.view,
    browser() as Layer.Layer<never>,
    { name: `scroll-${count++}`, input: Root.startAt },
  );
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
const open = async (url: string) => {
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
const back = async () => {
  await act(async () => history.back());
  await settle();
};
const top = (selector: string) => host.querySelector(selector)!.scrollTop;

beforeEach(() => {
  sessionStorage.clear();
  window.scrollTo(0, 0);
  host = document.createElement('div');
  document.body.append(host);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  host.remove();
});

describe("a page's own Scroll area", () => {
  it('per entry: Back puts it back, and a new entry starts at the top', async () => {
    await open('/f/inbox/a');
    await scroll(host.querySelector('#pane')!, 200);
    await click('b');
    expect(host.textContent).toContain('message b');
    expect(top('#pane')).toBe(0);

    await back();
    expect(host.textContent).toContain('message a');
    expect(top('#pane')).toBe(200);
  });

  it('per place: any way back to it puts it back, a plain link too', async () => {
    await open('/f/inbox');
    await scroll(host.querySelector('#list')!, 80);
    await click('to settings');
    expect(host.textContent).toContain('settings');

    await click('inbox');
    expect(top('#list')).toBe(80);
  });

  it('is never touched on a page whose mode is false', async () => {
    await open('/canvas');
    await scroll(host.querySelector('#board')!, 40);
    await click('to settings');
    await back();
    expect(top('#board')).toBe(0);
  });

  it('is put back on Back to an entry from before a reload', async () => {
    await open('/f/inbox/a');
    await scroll(host.querySelector('#pane')!, 200);
    await click('b');
    await load();
    expect(host.textContent).toContain('message b');

    await back();
    expect(host.textContent).toContain('message a');
    expect(top('#pane')).toBe(200);
  });

  it('outlasts a reload, from the tab’s session storage', async () => {
    await open('/f/inbox/a');
    await scroll(host.querySelector('#pane')!, 120);
    await load();
    expect(host.textContent).toContain('message a');
    expect(top('#pane')).toBe(120);
  });
});

describe('the window', () => {
  it('goes to the top for a push, and back where it was on Back', async () => {
    await open('/settings');
    await scroll(window, 300);
    await click('inbox');
    expect(scrollY).toBe(0);

    await back();
    expect(host.textContent).toContain('settings');
    expect(scrollY).toBe(300);
  });

  it('stays as it is for a push that keeps the page, as opening a message in its folder', async () => {
    await open('/f/inbox/a');
    await scroll(window, 400);
    await click('b');
    expect(host.textContent).toContain('message b');
    expect(scrollY).toBe(400);
  });

  it('stays as it is for a link that says keep', async () => {
    await open('/settings');
    await scroll(window, 300);
    await click('inbox, kept');
    expect(host.textContent).toContain('a');
    expect(scrollY).toBe(300);
  });

  it('is never moved by a past Step, as Time Travel shows it', async () => {
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

  it('is put back by Kabuki, not the browser', async () => {
    await open('/settings');
    expect(history.scrollRestoration).toBe('manual');
  });
});

describe('useScroll', () => {
  it('is refused outside a page', () => {
    function Loose() {
      useScroll();
      return null;
    }
    const loose = createRoot(document.createElement('div'));
    expect(() => act(() => loose.render(<Loose />))).toThrow(
      /useScroll is drawn outside a page/,
    );
  });
});
