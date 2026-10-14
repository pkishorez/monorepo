import { Schema } from 'effect';
import { expect, it } from 'vitest';
import type { Types } from '../../core/index.ts';
import { Navigation, Route, Router } from '../index.ts';

/*
 * A page whose Update moves the app with the Routes its own type is part of:
 * it hands the Router a function that makes the Route, so the page's type
 * never waits on the Routes'.
 */

// Read once first used: written before the pages, as a module the pages import is.
const Cycle = Route.tree(() => Root);

const Other = Route.page({ path: '/other' }).build({});
const Go = Route.page({
  path: '/go',
  requires: [Navigation],
  model: Schema.Struct({ clicks: Schema.Number }),
  message: Schema.TaggedUnion({ Clicked: {} }),
  state: Schema.TaggedUnion({ Idle: {}, Busy: {} }),
}).build({
  init: () => ({ model: { clicks: 0 }, state: { _tag: 'Idle' } }),
  on: {
    Clicked: (_, { model }) => ({
      model: { clicks: model.clicks + 1 },
      command: Router.push(() => Cycle.Other()),
    }),
  },
  state: {
    Busy: {
      on: { Clicked: () => ({ command: Router.replace(() => Cycle.Go()) }) },
    },
  },
});
const Root = Route.page({ pages: { Other, Go } }).build({});

it('types the Routes of pages whose Updates use them', () => {
  const other: { readonly _tag: string } = Cycle.Other();
  // What the function does is still checked.
  // @ts-expect-error no such page
  const wrong = () => Router.push(() => Cycle.Elsewhere());
  const probe = (props: Types<typeof Go.actor>['model']) => {
    const clicks: number = props.clicks;
    return clicks;
  };
  // @ts-expect-error no such page
  expect(() => Cycle.Nowhere()).toThrow();
  expect(other).toEqual({ _tag: 'Other' });
  expect(wrong).toThrow();
  expect(Cycle.paths()).toEqual({ Other: '/other', Go: '/go' });
  expect('Go' in Cycle).toBe(true);
  expect(Router.push(() => Cycle.Other())).toMatchObject({
    args: { route: { _tag: 'Other' } },
  });
  expect(probe).toBeTypeOf('function');
});
