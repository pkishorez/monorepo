import type { DataOf } from '@kestack/kabuki/types';
import { inputOf, valueOf } from '../../../../../../logic/shared/index.ts';
import type {
  BlueprintNode,
  Built,
  Draft,
  Input,
} from '../../../../../../logic/shared/index.ts';
import type { Action, InstanceShape } from './shape.ts';

export const acceptedOf = (
  print: BlueprintNode,
  state: string,
): ReadonlyArray<BlueprintNode['top']['messages'][number]> => {
  const all = [...print.top.messages, ...(print.states[state]?.messages ?? [])];
  return all.filter(
    (message, index) =>
      all.findIndex(({ tag }) => tag === message.tag) === index,
  );
};

export const actionsOf = ({ props }: DataOf<typeof InstanceShape>) =>
  acceptedOf(props.print, props.state).map(
    ({ tag, description, payload }): Action => ({
      tag,
      ...(description === undefined ? {} : { description }),
      input: inputOf(payload),
    }),
  );

export const isPast = ({ props }: DataOf<typeof InstanceShape>) =>
  props.at !== null;

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
