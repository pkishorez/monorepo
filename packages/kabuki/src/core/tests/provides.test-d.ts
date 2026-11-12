import { Context, Effect, Layer, Schema } from 'effect';
import { expectTypeOf } from 'vitest';
import { Actor } from '../index.ts';
import type { Needs } from '../runtime/index.ts';

/*
 * A level's Provides names its Capabilities beside the Layer that builds
 * them, and the Layer must build exactly those. What reaches below is the
 * list, so what descendants still need is read from it.
 */

class Session extends Context.Service<Session, { readonly user: string }>()(
  'Session',
) {}
class Theme extends Context.Service<Theme, { readonly dark: boolean }>()(
  'Theme',
) {}

const session = Layer.succeed(Session, { user: 'ada' });
const theme = Layer.succeed(Theme, { dark: true });
const both = Layer.mergeAll(session, theme);

const Uses = Actor.define('Uses', { requires: [Session, Theme] });
const UsesLive = Uses.build({
  workers: {
    work: {
      run: () =>
        Effect.flatMap(Session, () =>
          Effect.flatMap(Theme, () => Effect.never),
        ),
    },
  },
});

const Top = Actor.define('Top', {});

// Exactly the Capabilities named: fine, and they stop here.
const Exact = Top.build({
  provides: { capabilities: [Session, Theme], layer: () => both },
  children: { uses: Actor.child(UsesLive) },
});
expectTypeOf<Needs<typeof Exact>>().toEqualTypeOf<never>();

// Named but not built.
Top.build({
  // @ts-expect-error Theme is named, and the Layer does not build it
  provides: { capabilities: [Session, Theme], layer: () => session },
});

// Built but not named.
Top.build({
  // @ts-expect-error the Layer builds Theme, which `capabilities` does not name
  provides: { capabilities: [Session], layer: () => both },
});

// What descendants get is what is named: the rest still bubbles up.
const Half = Top.build({
  provides: { capabilities: [Session], layer: () => session },
  children: { uses: Actor.child(UsesLive) },
});
expectTypeOf<Needs<typeof Half>>().toEqualTypeOf<Theme>();

// The same in a State's block.
const Gate = Actor.define('Gate', {
  state: { Open: {}, Shut: {} },
});
const InState = Gate.build({
  init: () => ({ state: { _tag: 'Open' } }),
  states: {
    Open: {
      provides: { capabilities: [Session, Theme], layer: () => both },
      children: { uses: Actor.child(UsesLive) },
    },
  },
});
expectTypeOf<Needs<typeof InState>>().toEqualTypeOf<never>();
Gate.build({
  init: () => ({ state: { _tag: 'Open' } }),
  states: {
    // @ts-expect-error Open's Layer builds Theme, which it does not name
    Open: { provides: { capabilities: [Session], layer: () => both } },
  },
});
Gate.build({
  init: () => ({ state: { _tag: 'Open' } }),
  states: {
    // @ts-expect-error Shut names Theme, and its Layer does not build it
    Shut: { provides: { capabilities: [Theme], layer: () => session } },
  },
});

// A slot name is used once per Actor: a State's Child may not take a top-level one's.
const Bare = Actor.define('Bare', { model: { n: Schema.Number } }).build({
  init: () => ({ model: { n: 0 } }),
});
Gate.build({
  init: () => ({ state: { _tag: 'Open' } }),
  children: { kid: Actor.child(Bare) },
  states: {
    Open: {
      // @ts-expect-error `kid` is a slot name the top already has
      children: { kid: Actor.child(Bare), other: Actor.child(Bare) },
    },
    Shut: { children: { other: Actor.child(Bare) } },
  },
});
