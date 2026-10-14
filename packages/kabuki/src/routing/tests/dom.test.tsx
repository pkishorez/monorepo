// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root as ReactRoot } from 'react-dom/client';
import { Effect, Layer, Schema } from 'effect';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Actor, Runtime } from '../../core/index.ts';
import { View, toReact } from '../../react/index.ts';
import { registry } from '../../react/registry.ts';
import { browser } from '../adapter/browser/index.ts';
import { Route, Router, usePending, useRouter } from '../index.ts';
import type { How } from '../index.ts';

/*
 * The router drawn in a document: link clicks, the browser Adapter, Back and
 * Forward, the Metadata, a pending move, and what an outlet hands an animation.
 */

const Routes = Route.tree(
  {
    Home: Route.path('/', { metadata: { title: 'Home' } }),
    Projects: Route.path(
      '/projects',
      { metadata: { title: 'Projects' } },
      {
        List: Route.path('/'),
        Project: Route.path('/:id', {
          params: { id: Schema.FiniteFromString },
          metadata: ({ id }) => ({ title: `Project ${id}` }),
        }),
      },
    ),
  },
  { redirect: { '/old': (r) => r.Projects.List() } },
);

const HomeActor = Actor.make('Home', { props: Routes.Home.props }).build({});
const Home = {
  actor: HomeActor,
  view: View.make(HomeActor, () => (
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
  )),
};

const ProjectActor = Actor.make('Project', {
  props: Routes.Projects.Project.props,
}).build({});
const Project = {
  actor: ProjectActor,
  view: View.make(ProjectActor, ({ props }) => (
    <main>
      project {props.id}
      <Router.Link to={Routes.Home()}>home</Router.Link>
    </main>
  )),
};

const projects = Routes.Projects.outlet({
  List: () => <main>list</main>,
  Project,
});
let moves: Array<{
  readonly how: How;
  readonly from: string | null;
  readonly to: string | null;
}> = [];
const ProjectsActor = Actor.make('Projects', {
  props: Routes.Projects.props,
}).build({
  children: projects.children,
  invoke: projects.invoke,
});
const Projects = {
  actor: ProjectsActor,
  view: View.make(ProjectsActor, (self) => (
    <projects.View of={self}>
      {(page, move) => {
        moves.push({
          how: move.how,
          from: move.from?._tag ?? null,
          to: move.to?._tag ?? null,
        });
        return page?.element;
      }}
    </projects.View>
  )),
};

const pages = Routes.outlet({ Home, Projects });
const AppActor = Actor.make('App', { props: Routes.props }).build({
  children: pages.children,
  invoke: pages.invoke,
});
const App = {
  actor: AppActor,
  view: View.make(AppActor, (self) => <pages.View of={self} />),
};

const tick = () => act(() => new Promise((done) => setTimeout(done, 0)));
const settle = async () => {
  for (let i = 0; i < 5; i++) await tick();
};

let host: HTMLDivElement;
let root: ReactRoot | undefined;
let count = 0;

beforeEach(() => {
  registry.clear();
  moves = [];
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
  const Root = Router.app(Routes, App, { base: '/app' });
  const Drawn =
    adapter === 'memory'
      ? toReact(Root.actor, Root.view, Layer.empty, {
          name: `memory-${count++}`,
        })
      : toReact(Root.actor, Root.view, browser(), {
          name: `browser-${count++}`,
          input: Root.startAt,
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

  it("writes the title the Routes give each move's Route", async () => {
    await draw('browser', '/app');
    expect(document.title).toBe('Home');
    await click('a[href="/app/projects/7"]');
    expect(document.title).toBe('Project 7');
  });
});

describe('a move that waits on its Inputs', () => {
  const Item = Schema.Struct({ name: Schema.String });
  const Shop = Route.tree({
    Front: Route.path('/', {
      metadata: { title: 'Shop', description: 'Everything' },
    }),
    Item: Route.path('/items/:id', {
      params: { id: Schema.FiniteFromString },
      input: Item,
      metadata: (_params, item) => ({
        title: item.name,
        openGraph: { title: item.name },
      }),
    }),
  });
  let open: () => void = () => {};
  const loading = Router.memory(
    Shop,
    Shop.loaders({
      Item: ({ id }) =>
        Effect.promise(() => new Promise<void>((done) => (open = done))).pipe(
          Effect.as({ name: `Lamp ${id}` }),
        ),
    }),
  );
  function Progress() {
    // Typed as the shop's Route, so `Shop.path` takes it as it is.
    const pending = usePending<typeof Shop.route.Type>();
    return pending ? <p>loading {Shop.path(pending.to)}</p> : null;
  }
  const shop = Shop.outlet({
    Front: () => (
      <main>
        front
        <Router.Link to={Shop.Item({ id: 2 })}>lamp</Router.Link>
      </main>
    ),
    Item: (_props, item) => <main>item {item.name}</main>,
  });
  const ShopActor = Actor.make('Shop', { props: Shop.props }).build({});
  const ShopApp = {
    actor: ShopActor,
    view: View.make(ShopActor, (self) => (
      <>
        <Progress />
        <shop.View of={self} />
      </>
    )),
  };

  it('keeps the page drawn while it loads, shows it pending, then writes the Metadata', async () => {
    history.replaceState(null, '', '/');
    const unmarked = document.createElement('meta');
    unmarked.setAttribute('name', 'theme-color');
    document.head.append(unmarked);
    const Root = Router.app(Shop, ShopApp);
    const Drawn = toReact(
      Root.actor,
      Root.view,
      Layer.mergeAll(browser(), loading),
      { name: `shop-${count++}`, input: Root.startAt },
    );
    root = createRoot(host);
    await act(async () => root!.render(<Drawn />));
    await settle();
    expect(document.title).toBe('Shop');
    const described = () =>
      document.head
        .querySelector('meta[name="description"][data-kabuki]')
        ?.getAttribute('content');
    expect(described()).toBe('Everything');

    await click('a[href="/items/2"]');
    expect(host.textContent).toContain('front');
    expect(host.textContent).toContain('loading /items/2');
    expect(location.pathname).toBe('/');

    await act(async () => open());
    await settle();
    expect(host.textContent).toContain('item Lamp 2');
    expect(host.textContent).not.toContain('loading');
    expect(location.pathname).toBe('/items/2');
    expect(document.title).toBe('Lamp 2');
    expect(described()).toBeUndefined();
    expect(
      document.head
        .querySelector('meta[property="og:title"][data-kabuki]')
        ?.getAttribute('content'),
    ).toBe('Lamp 2');
    expect(unmarked.isConnected).toBe(true);
    unmarked.remove();
  });
});

describe('a page with pending and failed screens', () => {
  const Store = Route.tree({
    Front: Route.path('/'),
    Item: Route.path('/items/:id', {
      params: { id: Schema.FiniteFromString },
      input: Schema.Struct({ name: Schema.String }),
    }),
    Plain: Route.path('/plain', { input: Schema.String }),
    Note: Route.path('/note', { input: Schema.String }),
  });
  let open: () => void = () => {};
  let broken = false;
  const loading = Router.memory(
    Store,
    Store.loaders({
      Item: ({ id }) =>
        id === 3
          ? Effect.sleep('100 millis').pipe(
              Effect.andThen(
                Effect.fail(Route.redirect(Store.Item({ id: 2 }))),
              ),
            )
          : Effect.promise(
              () => new Promise<void>((done) => (open = done)),
            ).pipe(
              Effect.andThen(() =>
                broken ? Effect.die(new Error('the shelf fell')) : Effect.void,
              ),
              Effect.as({ name: `Lamp ${id}` }),
            ),
      Plain: () => Effect.die(new Error('no plain')),
      Note: () => Effect.die(new Error('no note')),
    }),
  );
  const ItemActor = Actor.make('Item', {
    input: Store.Item.input,
    props: Store.Item.props,
    model: Store.Item.input,
  }).build({ init: (item) => ({ model: item }) });
  const PlainActor = Actor.make('Plain', {
    input: Store.Plain.input,
    props: Store.Plain.props,
  }).build({ init: () => ({}) });
  let showing: Array<string> = [];
  function From() {
    const { move } = useRouter();
    return <p>from {move.from?._tag ?? 'nowhere'}</p>;
  }
  const store = Store.outlet({
    Front: () => (
      <main>
        front
        <Router.Link to={Store.Item({ id: 2 })}>lamp</Router.Link>
        <Router.Link to={Store.Item({ id: 3 })}>old lamp</Router.Link>
        <Router.Link to={Store.Plain()}>plain</Router.Link>
        <Router.Link to={Store.Note()}>note</Router.Link>
      </main>
    ),
    Item: {
      actor: ItemActor,
      view: View.make(ItemActor, ({ model }) => <main>item {model.name}</main>),
      pending: ({ id }) => <main>loading item {id}</main>,
      failed: ({ id }, { reason }) => (
        <main>
          item {id} broke: {reason}
          <Router.Link to={Store.Item({ id })}>retry</Router.Link>
        </main>
      ),
    },
    Plain: { actor: PlainActor, view: View.make(PlainActor, () => null) },
    Note: (_props, note) => <main>{note}</main>,
  });
  const StoreActor = Actor.make('Store', { props: Store.props }).build({
    children: store.children,
    invoke: store.invoke,
  });
  const StoreApp = {
    actor: StoreActor,
    view: View.make(StoreActor, (self) => (
      <>
        <From />
        <store.View of={self}>
          {(page) => {
            if (page) showing.push(page.showing);
            return page && <div key={page.key}>{page.element}</div>;
          }}
        </store.View>
      </>
    )),
  };
  // Wide margins, so a slow machine lands nowhere near an edge.
  const wait = (ms: number) =>
    act(() => new Promise((done) => setTimeout(done, ms)));
  const drawStore = async (withFailed = true) => {
    history.replaceState(null, '', '/');
    showing = [];
    broken = false;
    const Root = Router.app(Store, StoreApp, {
      pending: { delay: 50, minimum: 400 },
      ...(withFailed
        ? { failed: ({ reason }) => <main>the app broke: {reason}</main> }
        : {}),
    });
    const Drawn = toReact(
      Root.actor,
      Root.view,
      Layer.mergeAll(browser(), loading),
      { name: `store-${count++}`, input: Root.startAt },
    );
    root = createRoot(host);
    await act(async () => root!.render(<Drawn />));
    await settle();
  };

  it('keeps the page shown through a quick load', async () => {
    await drawStore();
    await click('a[href="/items/2"]');
    await act(async () => open());
    await settle();
    expect(host.textContent).toContain('item Lamp 2');
    expect(showing).not.toContain('pending');
  });

  it('lands a slow move with its pending screen, then the page once its Input comes', async () => {
    await drawStore();
    await click('a[href="/items/2"]');
    expect(host.textContent).toContain('front');
    await wait(200);
    expect(host.textContent).toContain('loading item 2');
    expect(location.pathname).toBe('/items/2');
    await wait(300);
    await act(async () => open());
    await settle();
    expect(host.textContent).toContain('item Lamp 2');
    expect(host.textContent).toContain('from Front');
    expect(showing.filter((each, at) => each !== showing[at - 1])).toEqual([
      'page',
      'pending',
      'page',
    ]);
  });

  it('keeps the pending screen its minimum, so it never flashes', async () => {
    await drawStore();
    await click('a[href="/items/2"]');
    await wait(100);
    await act(async () => open());
    await settle();
    expect(host.textContent).toContain('loading item 2');
    await wait(500);
    expect(host.textContent).toContain('item Lamp 2');
  });

  it('holds a failure as long, then shows the failed screen', async () => {
    await drawStore();
    broken = true;
    await click('a[href="/items/2"]');
    await wait(100);
    await act(async () => open());
    await settle();
    expect(host.textContent).toContain('loading item 2');
    await wait(500);
    expect(host.textContent).toContain('item 2 broke: the shelf fell');
  });

  it('shows the failed screen when the move breaks; a link to it shows it until the pending screen would', async () => {
    await drawStore();
    broken = true;
    await click('a[href="/items/2"]');
    await act(async () => open());
    await settle();
    expect(host.textContent).toContain('item 2 broke');
    expect(location.pathname).toBe('/items/2');
    broken = false;
    await click('a[href="/items/2"]');
    expect(host.textContent).toContain('item 2 broke');
    await wait(200);
    expect(host.textContent).toContain('loading item 2');
    await act(async () => open());
    await wait(500);
    expect(host.textContent).toContain('item Lamp 2');
  });

  it('keeps the move a Redirect ends a landed move with', async () => {
    await drawStore();
    await click('a[href="/items/3"]');
    await wait(200);
    expect(host.textContent).toContain('loading item 3');
    await wait(600);
    await act(async () => open());
    await wait(500);
    expect(location.pathname).toBe('/items/2');
    expect(host.textContent).toContain('item Lamp 2');
    expect(host.textContent).toContain('from Front');
  });

  it("shows the app's failed screen for a page with none", async () => {
    await drawStore();
    await click('a[href="/plain"]');
    expect(host.textContent).toContain('the app broke: no plain');
    expect(location.pathname).toBe('/plain');
  });

  it("shows the app's failed screen for a page a function draws", async () => {
    await drawStore();
    await click('a[href="/note"]');
    expect(host.textContent).toContain('the app broke: no note');
  });

  it('stays on the page shown when no failed screen would show the failure', async () => {
    await drawStore(false);
    await click('a[href="/plain"]');
    expect(host.textContent).toContain('front');
    expect(location.pathname).toBe('/');
  });
});

describe('the Timeline', () => {
  it('holds one Message per move on an Adapter: the Router never hears its own write back', async () => {
    history.replaceState(null, '', '/app');
    const Root = Router.app(Routes, App, { base: '/app' });
    const counts = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const app = yield* Runtime.start(Root.actor, browser());
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

describe('an outlet', () => {
  it('hands its page the move at its own level', async () => {
    await draw('memory');
    await click('a[href="/app/projects/7"]');
    expect(moves.at(-1)).toEqual({ how: 'push', from: null, to: 'Project' });
  });
});

describe('an outlet without a wrapper', () => {
  const Items = Route.tree({
    Item: Route.path('/items/:id', { params: { id: Schema.String } }),
    Sketch: Route.path('/sketch', { render: 'client' }),
  });
  /** Remembers the id it was first drawn with, for as long as React keeps it. */
  function First({ id }: { readonly id: string }) {
    const [first] = useState(id);
    return <p id="first">{first}</p>;
  }
  const items = Items.outlet({
    Item: ({ id }) => <First id={id} />,
    Sketch: () => <p id="sketch">sketch</p>,
  });
  const ItemsActor = Actor.make('Items', { props: Items.props }).build({
    children: items.children,
    invoke: items.invoke,
  });
  const ItemsApp = {
    actor: ItemsActor,
    view: View.make(ItemsActor, (self) => <items.View of={self} />),
  };

  it('draws a new page with fresh React state', async () => {
    history.replaceState(null, '', '/items/a');
    const Root = Router.app(Items, ItemsApp);
    const Drawn = toReact(Root.actor, Root.view, browser(), {
      name: `items-${count++}`,
      input: Root.startAt,
    });
    root = createRoot(host);
    await act(async () => root!.render(<Drawn />));
    await settle();
    expect(host.querySelector('#first')?.textContent).toBe('a');
    await act(async () => history.pushState(null, '', '/items/b'));
    await act(
      async () => void window.dispatchEvent(new PopStateEvent('popstate')),
    );
    await settle();
    expect(host.querySelector('#first')?.textContent).toBe('b');
  });

  it('draws a client place in the browser, never on a server', async () => {
    const { renderToString } = await import('react-dom/server');
    const Root = Router.app(Items, ItemsApp);
    const Drawn = toReact(Root.actor, Root.view, Layer.empty, {
      name: `sketch-${count++}`,
      input: () => Root.startAt('/sketch'),
    });
    expect(renderToString(<Drawn />)).not.toContain('sketch');
    root = createRoot(host);
    await act(async () => root!.render(<Drawn />));
    await settle();
    expect(host.querySelector('#sketch')).not.toBeNull();
  });
});
