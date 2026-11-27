import { Effect, Schema } from 'effect';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { Actor } from '../index.ts';
import type { SelfOf, UpdatesOf, WorkersOf } from '../types.ts';

const KettleShape = Actor.define('Kettle', {
  model: { boils: Schema.Number },
  state: { Cold: {}, Boiling: { since: Schema.Number } },
  message: { Started: { at: Schema.Number }, Boiled: {} },
});

const cold: UpdatesOf<typeof KettleShape, 'Cold'> = {
  Started: ({ at }, { state }) => {
    expectTypeOf(state).toEqualTypeOf<{ readonly _tag: 'Cold' }>();
    return { state: { _tag: 'Boiling', since: at } };
  },
};

const boiling: UpdatesOf<typeof KettleShape, 'Boiling'> = {
  Boiled: (_, { model, state }) => {
    expectTypeOf(state.since).toEqualTypeOf<number>();
    return { model: { boils: model.boils + 1 }, state: { _tag: 'Cold' } };
  },
};

const whistle = (self: SelfOf<typeof KettleShape, 'Boiling'>) =>
  Effect.flatMap(self.get, ({ state }) => {
    expectTypeOf(state.since).toEqualTypeOf<number>();
    return Effect.never;
  });

const whistles: WorkersOf<typeof KettleShape, 'Boiling'> = {
  whistle: { run: whistle },
};

/* Parts written outside `build` for one State's block, typed from the Shape. */

describe('UpdatesOf, WorkersOf and SelfOf for one State', () => {
  it('fit that State’s block in `build`', () => {
    const Kettle = KettleShape.build({
      init: () => ({ model: { boils: 0 }, state: { _tag: 'Cold' } }),
      states: {
        Cold: { on: cold },
        Boiling: { on: boiling, workers: whistles },
      },
    });
    expect(Kettle.blueprint.state['Boiling']!.workers).toEqual([
      { name: 'whistle', kind: 'state' },
    ]);
  });
});
