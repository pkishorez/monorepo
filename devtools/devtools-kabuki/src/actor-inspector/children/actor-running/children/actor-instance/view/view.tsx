import type { ViewPropsOf } from '@kestack/kabuki/react/types';
import { Sections } from '../../../../../view/shared/index.ts';
import { actionsOf, isPast } from '../logic/shared/index.ts';
import type { InstanceShape } from '../logic/shared/index.ts';
import { Actions } from './actions.tsx';

type BodyProps = ViewPropsOf<typeof InstanceShape>;

export function Body(self: BodyProps) {
  const { model, send } = self;
  return (
    <>
      <Sections opened={model.opened} />
      {model.problem && (
        <p className="px-1 pb-2 text-[11px] text-muted-foreground">
          {model.problem}
        </p>
      )}
      <Actions
        actions={actionsOf(self)}
        past={isPast(self)}
        sending={model.sending}
        outcome={model.outcome}
        onSend={(tag, message) => send({ _tag: 'Submitted', tag, message })}
        onEdit={(tag) => send({ _tag: 'Edited', tag })}
        onNow={() => send({ _tag: 'NowAsked' })}
      />
    </>
  );
}
