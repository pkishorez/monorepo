// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root as ReactRoot } from 'react-dom/client';
import { Effect, Layer, Schema } from 'effect';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { History, Runtime } from '../../core/index.ts';
import { View } from '../../react/index.ts';
import { Page, Router, useRouter } from '../index.ts';
import { Loading } from '../capabilities/index.ts';
import { registry } from '../../react/view/registry.ts';
import { keyIn } from '../router/adapter/index.ts';
import { browser } from '../router/adapter/browser/index.ts';

/*
 * The router drawn in a document: link clicks, the browser Adapter, Back and
 * Forward, the Metadata, a page drawing its own loading and failed screens,
 * a held move, and links that preload.
 */

/** Remembers the id it was first drawn with, for as long as React keeps it. */
function First({ id }: { readonly id: number }) {
  const [first] = useState(id);
  return <p id="first">{first}</p>;
}

const Project = Page.define({
  path: '/:id',
  params: { id: Schema.FiniteFromString },
  metadata: ({ id }) => ({ title: `Project ${id}` }),
});
const ProjectLive = Page.build(Project);
const ProjectView = View.make(ProjectLive, ({ props }) => (
  <main>
    project {props.params.id}
    <First id={props.params.id} />
    <Router.Link to={Routes.Home()}>home</Router.Link>
  </main>
));

const Projects = Page.define({
  path: '/projects',
  metadata: { title: 'Projects' },
  pages: { Project },
});
const ProjectsLive = Page.build(Projects, { pages: { Project: ProjectLive } });
const ProjectsView = View.make(ProjectsLive, (self) =>
  self.children.Project ? (
    <ProjectView instance={self.children.Project} />
  ) : (
    <main>list</main>
  ),
);

const Home = Page.define({ path: '/', metadata: { title: 'Home' } });
const HomeLive = Page.build(Home);
const HomeView = View.make(HomeLive, () => (
  <main>
    home
    <Router.Link to={Routes.Projects.Project({ id: 7 })}>seven</Router.Link>
    <a href="https://example.com/x">away</a>
    <a href="/app/projects/7" target="_blank">
      tab
    </a>
    <svg>
      <a href="/app/projects/7">
        <text>svg</text>
      </a>
    </svg>
  </main>
));

const App = Page.define({ pages: { Home, Projects } });
const AppLive = Page.build(App, {
  pages: { Home: HomeLive, Projects: ProjectsLive },
});
const AppView = View.make(AppLive, (self) => (
  <>
    {self.children.Home && <HomeView instance={self.children.Home} />}
    {self.children.Projects && (
      <ProjectsView instance={self.children.Projects} />
    )}
    {self.props.route.notFound !== null && <main>nowhere</main>}
  </>
));
const Routes = Router.define(App, {
  redirect: { '/old': (r) => r.Projects() },
  base: '/app',
});

const tick = () => act(() => new Promise((done) => setTimeout(done, 0)));
const settle = async () => {
  for (let i = 0; i < 5; i++) await tick();
};
const wait = (ms: number) =>
  act(() => new Promise((done) => setTimeout(done, ms)));

let host: HTMLDivElement;
let root: ReactRoot | undefined;
let count = 0;

beforeEach(() => {
  registry.clear();
  host = document.createElement('div');
  document.body.append(host);
  history.replaceState(null, '', '/');
  document.title = '';
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  host.remove();
});

/** Draw the app, in memory or on the browser's history at `/app`. */
const draw = async (adapter: 'memory' | 'browser', at = '/app') => {
  history.replaceState(null, '', at);
  const Root = Router.view(Routes, AppView);
  const Drawn =
    adapter === 'memory'
      ? View.app(Root, { name: `memory-${count++}` })
      : View.app(Root, {
          layer: browser(),
          name: `browser-${count++}`,
        });
  root = createRoot(host);
  await act(async () => root!.render(<Drawn />));
  await settle();
};

const click = async (selector: string, init: MouseEventInit = {}) => {
  const target = host.querySelector(selector)!;
  const event = new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    button: 0,
    ...init,
  });
  await act(async () => void target.dispatchEvent(event));
  await settle();
  return event;
};

describe('in memory', () => {
  it('follows a link, and never touches the URL or the title', async () => {
    await draw('memory', '/elsewhere');
    expect(host.textContent).toContain('home');
    const event = await click('a[href="/app/projects/7"]');
    expect(event.defaultPrevented).toBe(true);
    expect(host.textContent).toContain('project 7');
    expect(location.pathname).toBe('/elsewhere');
    expect(document.title).toBe('');
  });

  it('leaves a new tab, another site and an svg link to the browser', async () => {
    await draw('memory');
    expect((await click('a[target="_blank"]')).defaultPrevented).toBe(false);
    expect((await click('a[href^="https://"]')).defaultPrevented).toBe(false);
    expect(
      (await click('a[href="/app/projects/7"]', { metaKey: true }))
        .defaultPrevented,
    ).toBe(false);
    expect((await click('svg a')).defaultPrevented).toBe(false);
    expect(host.textContent).toContain('home');
  });
});

describe('on the browser history', () => {
  it('is drawn at the URL from the first frame', async () => {
    await draw('browser', '/app/projects/3');
    expect(host.textContent).toContain('project 3');
  });

  it('writes each move to the URL, and follows Back and Forward', async () => {
    await draw('browser', '/app');
    await click('a[href="/app/projects/7"]');
    expect(location.pathname).toBe('/app/projects/7');
    expect(host.textContent).toContain('project 7');

    await act(async () => history.back());
    await settle();
    expect(location.pathname).toBe('/app');
    expect(host.textContent).toContain('home');

    await act(async () => history.forward());
    await settle();
    expect(host.textContent).toContain('project 7');
  });

  it('replaces a redirect, and a URL that is not how its Route is written', async () => {
    await draw('browser', '/app/old');
    expect(location.pathname).toBe('/app/projects');
    expect(host.textContent).toContain('list');
    await act(async () => root?.unmount());
    root = undefined;
    await draw('browser', '/app/projects/07/');
    expect(location.pathname).toBe('/app/projects/7');
  });

  it('replaces a redirect it hears while its Route is on screen', async () => {
    await draw('browser', '/app/projects');
    await act(async () => history.pushState(null, '', '/app/old'));
    await act(
      async () => void window.dispatchEvent(new PopStateEvent('popstate')),
    );
    await settle();
    expect(location.pathname).toBe('/app/projects');
    expect(host.textContent).toContain('list');
  });

  it('leaves a query no page reads in the address, and writes each move without it', async () => {
    const address = () => `${location.pathname}${location.search}`;
    await draw('browser', '/app?ref=x');
    expect(address()).toBe('/app?ref=x');
    expect(keyIn(history.state)).not.toBeNull();
    await click('a[href="/app/projects/7"]');
    expect(address()).toBe('/app/projects/7');
    // Back lands on the entry as the browser kept it.
    await act(async () => history.back());
    await settle();
    expect(address()).toBe('/app?ref=x');
    expect(host.textContent).toContain('home');
    await act(async () => root?.unmount());
    root = undefined;
    // A redirect the browser follows writes its Route alone.
    await draw('browser', '/app/old?ref=x');
    expect(address()).toBe('/app/projects');
  });

  it("writes the title the Routes give each move's Route", async () => {
    await draw('browser', '/app');
    expect(document.title).toBe('Home');
    await click('a[href="/app/projects/7"]');
    expect(document.title).toBe('Project 7');
  });

  it('draws a page with new params with fresh React state', async () => {
    await draw('browser', '/app/projects/1');
    expect(host.querySelector('#first')?.textContent).toBe('1');
    await act(async () => history.pushState(null, '', '/app/projects/2'));
    await act(
      async () => void window.dispatchEvent(new PopStateEvent('popstate')),
    );
    await settle();
    expect(host.querySelector('#first')?.textContent).toBe('2');
  });

  it('hands the root page a URL that names no place', async () => {
    await draw('browser', '/app/nowhere');
    expect(host.textContent).toContain('nowhere');
  });
});

describe('a reload', () => {
  /** The page loaded again: a new app on the same history, its entries and their state kept. */
  const reload = async () => {
    await act(async () => root?.unmount());
    registry.clear();
    const Root = Router.view(Routes, AppView);
    const Drawn = View.app(Root, {
      layer: browser(),
      name: `browser-${count++}`,
    });
    root = createRoot(host);
    await act(async () => root!.render(<Drawn />));
    await settle();
  };
  const key = () => keyIn(history.state);

  it('keeps the key of the entry it opens at, and gives keys no earlier page load gave', async () => {
    await draw('browser', '/app');
    const home = key();
    await click('a[href="/app/projects/7"]');
    const seven = key();
    expect(new Set([home, seven]).size).toBe(2);

    await reload();
    expect(key()).toBe(seven);
    await click('a[href="/app"]');
    expect([home, seven]).not.toContain(key());
  });

  it('keeps the key of an entry from before it, on Back', async () => {
    await draw('browser', '/app');
    const home = key();
    await click('a[href="/app/projects/7"]');
    await reload();

    await act(async () => history.back());
    await settle();
    expect(host.textContent).toContain('home');
    expect(key()).toBe(home);
  });
});

describe('a page with data', () => {
  const ItemData = Schema.Struct({ name: Schema.String });
  const Item = Page.define({
    path: '/items/:id',
    params: { id: Schema.FiniteFromString },
    data: ItemData,
    metadata: (_params, item) => ({
      title: item?.name ?? 'An item',
      ...(item ? { openGraph: { title: item.name } } : {}),
    }),
  });
  const ItemLive = Page.build(Item);
  const ItemView = View.make(ItemLive, ({ props }) => {
    switch (props.status._tag) {
      case 'Loading':
        return <main>loading item {props.params.id}</main>;
      case 'Failed':
        return (
          <main>
            item {props.params.id} broke: {props.status.reason}
            <Router.Retry>retry</Router.Retry>
          </main>
        );
      case 'Ready':
        return (
          <main>
            item {props.status.data.name}
            {props.status.refreshing && ' (refreshing)'}
          </main>
        );
    }
  });
  const Front = Page.define({
    path: '/',
    metadata: { title: 'Shop', description: 'Everything' },
  });
  const FrontLive = Page.build(Front);
  const FrontView = View.make(FrontLive, () => (
    <main>
      front
      <Router.Link to={Shop.Item({ id: 2 })} id="lamp">
        lamp
      </Router.Link>
      <Router.Link to={Shop.Item({ id: 5 })} id="never" preload={false}>
        never
      </Router.Link>
    </main>
  ));
  function Progress() {
    const { pending } = useRouter<typeof Shop.route.Type>();
    return pending ? <p>moving to {Shop.path(pending.to)}</p> : null;
  }
  function From() {
    const { move } = useRouter();
    return <p>from {move.from?._tag ?? 'nowhere'}</p>;
  }
  const ShopRoot = Page.define({ pages: { Front, Item } });
  const ShopLive = Page.build(ShopRoot, {
    pages: { Front: FrontLive, Item: ItemLive },
  });
  const ShopView = View.make(ShopLive, (self) => (
    <>
      <Progress />
      <From />
      {self.children.Front && <FrontView instance={self.children.Front} />}
      {self.children.Item && <ItemView instance={self.children.Item} />}
    </>
  ));
  const Shop = Router.define(ShopRoot, { preloadDelay: 20 });

  let open: () => void = () => {};
  let broken = false;
  let calls: Array<number> = [];
  const loading = Loading.cached(
    Shop,
    Loading.memory(
      Shop,
      Shop.loaders({
        Item: ({ id }) =>
          Effect.sync(() => calls.push(id)).pipe(
            Effect.andThen(
              Effect.promise(() => new Promise<void>((done) => (open = done))),
            ),
            Effect.andThen(() =>
              broken ? Effect.die(new Error('the shelf fell')) : Effect.void,
            ),
            Effect.as({ name: `Lamp ${id}` }),
          ),
      }),
    ),
  );
  const drawShop = async () => {
    history.replaceState(null, '', '/');
    broken = false;
    calls = [];
    const Root = Router.view(Shop, ShopView);
    const Drawn = View.app(Root, {
      layer: Layer.mergeAll(browser(), loading),
      name: `shop-${count++}`,
    });
    root = createRoot(host);
    await act(async () => root!.render(<Drawn />));
    await settle();
  };
  const described = () =>
    document.head
      .querySelector('meta[name="description"][data-kabuki]')
      ?.getAttribute('content');

  it('keeps the page drawn through a quick load, then lands Ready and writes the Metadata', async () => {
    const unmarked = document.createElement('meta');
    unmarked.setAttribute('name', 'theme-color');
    document.head.append(unmarked);
    await drawShop();
    expect(document.title).toBe('Shop');
    expect(described()).toBe('Everything');

    await click('#lamp');
    expect(host.textContent).toContain('front');
    expect(host.textContent).toContain('moving to /items/2');
    expect(location.pathname).toBe('/');

    await act(async () => open());
    await settle();
    expect(host.textContent).toContain('item Lamp 2');
    expect(host.textContent).not.toContain('loading');
    expect(host.textContent).toContain('from Front');
    expect(location.pathname).toBe('/items/2');
    expect(document.title).toBe('Lamp 2');
    expect(described()).toBeUndefined();
    expect(unmarked.isConnected).toBe(true);
    unmarked.remove();
  });

  it('lands a slow move with the page drawing its own loading screen, then its data, and the Metadata follows', async () => {
    await drawShop();
    await click('#lamp');
    await wait(250);
    expect(host.textContent).toContain('loading item 2');
    expect(location.pathname).toBe('/items/2');
    expect(document.title).toBe('An item');
    await act(async () => open());
    await wait(400);
    expect(host.textContent).toContain('item Lamp 2');
    expect(document.title).toBe('Lamp 2');
  });

  it('keeps the loading screen its minimum, so it never flashes', async () => {
    await drawShop();
    await click('#lamp');
    await wait(200);
    await act(async () => open());
    await settle();
    expect(host.textContent).toContain('loading item 2');
    await wait(400);
    expect(host.textContent).toContain('item Lamp 2');
  });

  it('draws the failure on the page; Retry loads it again', async () => {
    await drawShop();
    broken = true;
    await click('#lamp');
    await act(async () => open());
    await settle();
    expect(host.textContent).toContain('item 2 broke: the shelf fell');
    broken = false;
    await click('button');
    expect(host.textContent).toContain('loading item 2');
    await act(async () => open());
    await wait(400);
    expect(host.textContent).toContain('item Lamp 2');
  });

  it('a link preloads on hover, and the move then shows its data at once', async () => {
    await drawShop();
    const lamp = host.querySelector('#lamp')!;
    await act(
      async () =>
        void lamp.dispatchEvent(
          new MouseEvent('mouseover', { bubbles: true, relatedTarget: null }),
        ),
    );
    await wait(60);
    expect(calls).toEqual([2]);
    await act(async () => open());
    await settle();
    await click('#lamp');
    expect(host.textContent).toContain('item Lamp 2');
    expect(calls).toEqual([2]);
  });

  it('a link told not to preload never does', async () => {
    await drawShop();
    const never = host.querySelector('#never')!;
    await act(
      async () =>
        void never.dispatchEvent(
          new MouseEvent('mouseover', { bubbles: true, relatedTarget: null }),
        ),
    );
    await wait(60);
    expect(calls).toEqual([]);
  });

  it('a server draws a page without its data at its loading screen', async () => {
    const { renderToString } = await import('react-dom/server');
    const Root = Router.view(Shop, ShopView);
    const Drawn = View.app(Root, {
      name: `server-${count++}`,
      input: () => Root.startAt('/items/4'),
    });
    expect(renderToString(<Drawn />)).toContain('loading item <!-- -->4');
  });
});

describe('the Timeline', () => {
  it('holds one Message per move on an Adapter: the Router never hears its own write back', async () => {
    history.replaceState(null, '', '/app');
    const Root = Router.view(Routes, AppView);
    const counts = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const app = yield* Runtime.start(History.make(Root.actor), browser());
          const settled = Effect.promise(
            () => new Promise((done) => setTimeout(done, 10)),
          );
          yield* settled;
          const before = app.history.branch().length;
          app.send('Router', {
            _tag: 'Pushed',
            route: Routes.Projects.Project({ id: 7 }),
          });
          yield* settled;
          const pushed = app.history.branch().length - before;
          history.back();
          yield* settled;
          return {
            pushed,
            back: app.history.branch().length - before - pushed,
          };
        }),
      ),
    );
    expect(counts).toEqual({ pushed: 1, back: 1 });
    expect(location.pathname).toBe('/app');
  });
});
