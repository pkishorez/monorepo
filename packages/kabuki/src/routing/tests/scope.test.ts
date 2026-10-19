import { Effect, Schema } from 'effect';
import type { Scope } from 'effect';
import { expect, it } from 'vitest';
import { Runtime } from '../../core/index.ts';
import type { Instance, Running } from '../../core/index.ts';
import { View } from '../../react/index.ts';
import { Page, Router } from '../index.ts';

/*
 * A page's `scope` says whose its pages are: when it changes, as when
 * another account signs in, every page under it starts again, with fresh
 * Models and Workers, though the URL stays.
 */

const Home = Page.define({
  path: '/',
  model: Schema.Struct({ typed: Schema.String }),
  message: Schema.TaggedUnion({ Typed: { text: Schema.String } }),
});
const HomeLive = Page.build(Home, {
  init: () => ({ model: { typed: '' } }),
  on: { Typed: ({ text }) => ({ model: { typed: text } }) },
});
const App = Page.define({
  pages: { Home },
  model: Schema.Struct({ who: Schema.String }),
  message: Schema.TaggedUnion({ Switched: { who: Schema.String } }),
});
const AppLive = Page.build(App, {
  pages: { Home: HomeLive },
  scope: ({ model }) => model.who,
  init: () => ({ model: { who: 'ada' } }),
  on: { Switched: ({ who }) => ({ model: { who } }) },
});
const router = Router.define(App);
const Root = Router.app(
  router,
  View.make(AppLive, () => null),
);

const find = (app: Running<unknown>, name: string) => {
  const walk = (at: Instance): ReadonlyArray<Instance> => [
    at,
    ...Object.values(at.children).flatMap((child) =>
      ((Array.isArray(child) ? child : [child]) as Array<Instance>).flatMap(
        walk,
      ),
    ),
  ];
  return walk(app.snapshot()).find((each) => each.actor === name)!;
};

const run = <A>(effect: Effect.Effect<A, never, Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(effect));

it('starts every page under it again when its scope changes', () =>
  run(
    Effect.gen(function* () {
      const app = yield* Runtime.start(Root.actor);
      yield* Effect.yieldNow;
      const first = find(app, 'Home');
      app.send(first.id, { _tag: 'Typed', text: 'mine' });
      expect(find(app, 'Home').model).toEqual({ typed: 'mine' });

      // The same account again: the page is kept.
      const root = find(app, 'App').id;
      app.send(root, { _tag: 'Switched', who: 'ada' });
      expect(find(app, 'Home').id).toBe(first.id);

      app.send(root, { _tag: 'Switched', who: 'bob' });
      expect(find(app, 'Home').id).not.toBe(first.id);
      expect(find(app, 'Home').model).toEqual({ typed: '' });
    }),
  ));
