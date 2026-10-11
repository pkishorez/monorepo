import { Schema } from 'effect';
import { Actor } from 'effect-oak';
import { Counter } from '../actor/index.js';

/*
 * A Room with two States. While Occupied it Invokes the Counter from
 * demo 1 as the fixed Child `counter`. Toggle is the Transition both ways:
 * leaving Occupied stops the Counter, so its count is gone; entering
 * Occupied again Invokes a fresh one, starting at 0 with a new Instance ID.
 */
export const Room = Actor.make('Room', {
  state: Schema.TaggedUnion({ Empty: {}, Occupied: {} }),
  message: Schema.TaggedUnion({ Toggle: {} }),
  children: { Occupied: { counter: Counter } },
}).build({
  init: () => ({ state: { _tag: 'Empty' } }),
  update: {
    Empty: { Toggle: () => ({ state: { _tag: 'Occupied' } }) },
    Occupied: { Toggle: () => ({ state: { _tag: 'Empty' } }) },
  },
});
