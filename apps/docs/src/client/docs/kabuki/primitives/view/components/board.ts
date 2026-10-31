import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';

export const Card = Actor.define('Card', {
  input: Schema.Struct({ name: Schema.String }),
  model: Schema.Struct({ name: Schema.String, likes: Schema.Number }),
  message: Schema.TaggedUnion({ Liked: {} }),
});

export const CardLive = Actor.build(Card, {
  init: ({ name }) => ({ model: { name, likes: 0 } }),
  on: {
    Liked: (_, { model }) => ({ model: { ...model, likes: model.likes + 1 } }),
  },
});

export const Board = Actor.define('Board', {});

export const BoardLive = Actor.build(Board, {
  children: (child) => ({
    // One Card per name, each its own Instance.
    cards: child(CardLive, {
      each: () => ['Coffee', 'Tea', 'Cocoa'],
      input: (_, name) => ({ name }),
    }),
  }),
});
