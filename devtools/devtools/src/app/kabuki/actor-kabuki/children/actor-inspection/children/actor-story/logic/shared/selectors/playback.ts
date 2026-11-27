import type { DataOf } from '@kestack/kabuki/types';
import type { StoryShape, Turn } from '../index.js';
import { pictureOf } from './picture.js';
import type { Picture } from './picture.js';

type Data = DataOf<typeof StoryShape>;

export const beatsOf = (turns: ReadonlyArray<Turn>, turn: number) =>
  turns[turn]?.answer?.beats ?? [];

export const focusOf = ({ model }: Data) => {
  if (model.at === null) return null;
  const beats = beatsOf(model.turns, model.at.turn);
  const beat = beats[model.at.beat];
  if (beat === undefined) return null;
  return {
    turn: model.at.turn,
    index: model.at.beat,
    of: beats.length,
    beat,
    picture: pictureOf(model.plan, beat),
  };
};

export type Focus = NonNullable<ReturnType<typeof focusOf>>;

export const missedOf = ({ model }: Data) => {
  const missed = new Set(
    model.turns.flatMap((turn, at) =>
      (turn.answer?.beats ?? []).flatMap((beat, number) =>
        pictureOf(model.plan, beat).missing.length > 0
          ? [`${at}:${number}`]
          : [],
      ),
    ),
  );
  return (turn: number, beat: number) => missed.has(`${turn}:${beat}`);
};

export type Mode = 'story' | 'explore';

export interface Stage {
  readonly mode: Mode;
  readonly focus: Focus | null;
  readonly picture: Picture;
}

export const stageOf = (data: Data): Stage => {
  const focus = focusOf(data);
  const explore = data.model.explore;
  if (focus !== null && explore === null)
    return { mode: 'story', focus, picture: focus.picture };
  return {
    mode: 'explore',
    focus,
    picture: pictureOf(data.model.plan, {
      show: explore ?? [],
      ...(focus?.beat.links === undefined ? {} : { links: focus.beat.links }),
    }),
  };
};
