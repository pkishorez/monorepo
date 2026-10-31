import { Schema } from 'effect';
import { expect, it } from 'vitest';
import type { Actor } from '../../core/index.ts';
import { Page, Router } from '../index.ts';

/*
 * A page's build moves the app with the router read down from the pages'
 * definitions: the router never waits on a build, so a build may name any
 * Route by type.
 */

// Read once first used: written before the pages, as a module the pages import is.
const router = Router.define(() => Root);

const Other = Page.define({ path: '/other' });
const Go = Page.define({
  path: '/go',
  model: Schema.Struct({ clicks: Schema.Number }),
  message: Schema.TaggedUnion({ Clicked: {} }),
  state: Schema.TaggedUnion({ Idle: {}, Busy: {} }),
});
const Root = Page.define({ pages: { Other, Go } });

const GoLive = Page.build(Go, {
  init: () => ({ model: { clicks: 0 }, state: { _tag: 'Idle' } }),
  on: {
    Clicked: (_, { model }) => ({
      model: { clicks: model.clicks + 1 },
      command: Router.push(router.Other()),
    }),
  },
  state: {
    Busy: {
      on: { Clicked: () => ({ command: Router.replace(router.Go()) }) },
    },
  },
});
const RootLive = Page.build(Root, {
  pages: { Other: Page.build(Other), Go: GoLive },
});

it('types the Routes a build moves the app with', () => {
  const other: typeof router.route.Type = router.Other();
  // @ts-expect-error no such page
  const wrong = () => Router.push(router.Elsewhere());
  const probe = (model: Actor.Types<typeof GoLive>['model']) => {
    const clicks: number = model.clicks;
    return clicks;
  };
  // @ts-expect-error no such page
  expect(() => router.Nowhere()).toThrow();
  expect(other).toEqual({ _tag: 'Other' });
  expect(wrong).toThrow();
  expect(router.paths()).toEqual({ Other: '/other', Go: '/go' });
  expect('Go' in router).toBe(true);
  expect(router.root).toBe(Root);
  expect(RootLive.pages.Go).toBe(GoLive);
  expect(Router.push(router.Other())).toMatchObject({
    args: { route: { _tag: 'Other' } },
  });
  expect(probe).toBeTypeOf('function');
});
