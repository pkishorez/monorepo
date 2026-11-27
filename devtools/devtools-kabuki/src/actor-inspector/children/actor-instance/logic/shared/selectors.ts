import type { DataOf } from '@kestack/kabuki/types';
import { inputOf, valueOf } from '../../../../logic/shared/index.ts';
import type { Built, Draft, Input } from '../../../../logic/shared/index.ts';
import type { Action, InstanceShape, Outcome } from './shape.ts';

type Data = DataOf<typeof InstanceShape>;

export const actionsOf = ({ model }: Data): ReadonlyArray<Action> =>
  (model.looked?.takes ?? []).map(
    ({ tag, description, payload, within }): Action => ({
      tag,
      ...(description === undefined ? {} : { description }),
      within,
      input: inputOf(payload),
    }),
  );

export const isPast = ({ props }: Data) => props.at !== null;

export const messageOf = (tag: string, input: Input, draft: Draft): Built => {
  const payload = valueOf(input, draft);
  if (payload._tag === 'Unbuilt') return payload;
  const { value } = payload;
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? { _tag: 'Built', value: { ...value, _tag: tag } }
    : {
        _tag: 'Unbuilt',
        problems: [{ path: '', problem: 'A Message is an object' }],
      };
};

export const hasFields = (value: unknown): boolean =>
  typeof value === 'object' &&
  value !== null &&
  Object.keys(value).some((key) => key !== '_tag');

export const outcomeOf = ({ model }: Data, tag: string): Outcome | undefined =>
  model.outcome?.tag === tag ? model.outcome : undefined;
