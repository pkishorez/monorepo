import type { InitOf, UpdatesOf } from '@kestack/kabuki/types';
import { control } from './commands.ts';
import { outcomeOf } from './shared/index.ts';
import type { Outcome, WorldShape } from './shared/index.ts';

export const init: InitOf<typeof WorldShape> = () => ({
  model: { outcomes: [] },
});

const told = (
  outcomes: ReadonlyArray<Outcome>,
  outcome: Outcome,
): ReadonlyArray<Outcome> => [
  ...outcomes.filter(
    (one) => one.fake !== outcome.fake || one.control !== outcome.control,
  ),
  outcome,
];

export const updates: UpdatesOf<typeof WorldShape> = {
  Submitted: ({ fake, control: name, payload }, data) =>
    outcomeOf(data, fake, name)?.said === 'running'
      ? {}
      : {
          model: {
            outcomes: told(data.model.outcomes, {
              fake,
              control: name,
              said: 'running',
            }),
          },
          command: control({ fake, control: name, payload }),
        },
  Ran: ({ fake, control: name }, { model }) => ({
    model: {
      outcomes: told(model.outcomes, { fake, control: name, said: 'done' }),
    },
  }),
  Edited: ({ fake, control: name }, data) => {
    const said = outcomeOf(data, fake, name)?.said;
    return said === undefined || said === 'running'
      ? {}
      : {
          model: {
            outcomes: data.model.outcomes.filter(
              (one) => one.fake !== fake || one.control !== name,
            ),
          },
        };
  },
  Refused: ({ fake, control: name, reason }, { model }) => ({
    model: {
      outcomes: told(model.outcomes, {
        fake,
        control: name,
        said: 'refused',
        reason,
      }),
    },
  }),
};
