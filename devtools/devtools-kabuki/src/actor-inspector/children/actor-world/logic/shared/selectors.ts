import type { DataOf } from '@kestack/kabuki/types';
import { inputOf } from '../../../../logic/shared/index.ts';
import type { Control, Fake, WorldShape } from './shape.ts';

type Data = DataOf<typeof WorldShape>;

const WORD = /[A-Z]?[a-z0-9]+|[A-Z]+(?![a-z])/g;

const labelOf = (name: string) => {
  const words = (name.match(WORD) ?? [name]).map((word) => word.toLowerCase());
  const text = words.join(' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
};

const fieldsOf = (value: unknown): Fake['fields'] =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.entries(value)
    : [['value', value]];

export const hasFakes = ({ model }: Data): boolean =>
  model.fakes !== null && model.fakes.length > 0;

const refusalOf = ({ model }: Data, fake: string): Fake['refusal'] =>
  model.refusal?.fake === fake
    ? { ...model.refusal, label: labelOf(model.refusal.control) }
    : null;

export const fakesOf = (data: Data): ReadonlyArray<Fake> =>
  (data.model.fakes ?? []).map(({ name, value, controls }) => ({
    name,
    label: labelOf(name),
    value,
    fields: fieldsOf(value),
    controls: controls.map(({ name: control, description, payload }) => {
      const input = inputOf(payload);
      const one: Control = {
        name: control,
        label: labelOf(control),
        ...(description === undefined ? {} : { description }),
        input,
        bare: input.kind === 'group' && input.fields.length === 0,
      };
      return one;
    }),
    refusal: refusalOf(data, name),
  }));
