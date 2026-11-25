import type { DataOf } from '@kestack/kabuki/types';
import { inputOf } from '../../../../logic/shared/index.ts';
import type { Outcome, Shown, WorldShape } from './shape.ts';

type Data = DataOf<typeof WorldShape>;

export const outcomeOf = (
  { model }: Data,
  fake: string,
  control: string,
): Outcome | undefined =>
  model.outcomes.find((one) => one.fake === fake && one.control === control);

export const fakesOf = (data: Data): ReadonlyArray<Shown> =>
  data.props.fakes.map(({ name, value, controls }) => ({
    name,
    value,
    controls: controls.map((control) => {
      const input = inputOf(control.payload);
      return {
        name: control.name,
        input,
        bare: input.kind === 'group' && input.fields.length === 0,
        outcome: outcomeOf(data, name, control.name),
      };
    }),
  }));
