import { Effect, Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { shellStory } from './scenes.ts';

/*
 * Story: a Story an agent wrote, told one Scene at a time.
 *
 * 1. Where    Paused holds a Scene; Playing moves on one Scene at a time,
 *             its `play` Worker ticking only while it lasts, and pauses
 *             on the last.
 * 2. Open     the cards open: each Scene opens its own Actor's, and the
 *             reader opens and closes any other. One opening never closes
 *             another.
 */

const LAST = shellStory.scenes.length - 1;
const TICK = '7 seconds';

/** The card a Scene is about, by the canvas's id for it. */
const cardOf = (scene: number) => {
  const path = shellStory.scenes[scene]?.path ?? '';
  return path === '' ? '/' : path;
};

const opening = (opened: ReadonlyArray<string>, id: string) => [
  ...opened.filter((one) => one !== id),
  id,
];

export const Story = Actor.define('Story', {
  model: Schema.Struct({ opened: Schema.Array(Schema.String) }),
  state: Schema.TaggedUnion({
    Paused: { scene: Schema.Number },
    Playing: { scene: Schema.Number },
  }),
  message: Schema.TaggedUnion({
    Chose: { scene: Schema.Number },
    Play: {},
    Pause: {},
    Ticked: {},
    Toggled: { id: Schema.String, open: Schema.Boolean },
  }),
});

/** A Scene shown: its card opened. */
const at = (
  opened: ReadonlyArray<string>,
  tag: 'Paused' | 'Playing',
  scene: number,
) => ({
  model: { opened: opening(opened, cardOf(scene)) },
  state: { _tag: tag, scene },
});

export const StoryLive = Actor.build(Story, {
  init: () => ({
    model: { opened: [cardOf(0)] },
    state: { _tag: 'Paused', scene: 0 },
  }),
  on: {
    Chose: ({ scene }, { model }) =>
      at(model.opened, 'Paused', Math.max(0, Math.min(LAST, scene))),
    // 2. Open
    Toggled: ({ id, open }, { model }) => ({
      model: {
        opened: open
          ? opening(model.opened, id)
          : model.opened.filter((one) => one !== id),
      },
    }),
  },
  // 1. Where
  state: {
    Paused: {
      on: {
        Play: (_, { model, state }) =>
          at(model.opened, 'Playing', state.scene >= LAST ? 0 : state.scene),
      },
    },
    Playing: {
      workers: {
        play: {
          run: (self) =>
            Effect.forever(
              Effect.andThen(Effect.sleep(TICK), self.send({ _tag: 'Ticked' })),
            ),
        },
      },
      on: {
        Pause: (_, { state }) => ({
          state: { _tag: 'Paused', scene: state.scene },
        }),
        Ticked: (_, { model, state }) =>
          state.scene >= LAST
            ? { state: { _tag: 'Paused', scene: LAST } }
            : at(model.opened, 'Playing', state.scene + 1),
      },
    },
  },
});
