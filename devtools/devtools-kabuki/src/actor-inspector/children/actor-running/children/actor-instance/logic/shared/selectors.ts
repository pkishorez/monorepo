import type { DataOf } from '@kestack/kabuki/types';
import { inputOf } from '../../../../../../logic/shared/index.ts';
import type { BlueprintNode } from '../../../../../../logic/shared/index.ts';
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
