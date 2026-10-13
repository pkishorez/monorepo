// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root as ReactRoot } from 'react-dom/client';
import { Effect, Layer, Schema } from 'effect';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Actor, Runtime } from '../../core/index.ts';
import { View, toReact } from '../../react/index.ts';
import { registry } from '../../react/registry.ts';
import { browser } from '../browser/index.ts';
import { Route, Router } from '../index.ts';
import type { How } from '../index.ts';

/*
 * The router drawn in a document: link clicks, the browser Adapter, Back and
 * Forward, the head, and what an outlet hands an animation.
 */

const Routes = Route.tree(
  {
    Home: Route.path('/', { head: { title: 'Home' } }),
    Projects: Route.path(
      '/projects',
      { head: { title: 'Projects' } },
      {
        List: Route.path('/'),
        Project: Route.path('/:id', {
          params: { id: Schema.FiniteFromString },
          head: ({ id }) => ({ title: `Project ${id}` }),
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
      <Router.Head title={`Harbor ${props.id}`} />
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

  it("writes the head: the Routes', then a page's own", async () => {
    await draw('browser', '/app');
    expect(document.title).toBe('Home');
    await click('a[href="/app/projects/7"]');
    expect(document.title).toBe('Harbor 7');
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
