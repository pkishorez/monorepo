import type { ViewPropsOf } from '@kestack/kabuki/react/types';
import { Sections } from '../../../../../view/shared/index.ts';
import { actionsOf, isPast } from '../logic/shared/index.ts';
import type { InstanceShape } from '../logic/shared/index.ts';
import { Actions, foldedOf, PastStep } from './actions.tsx';

type BodyProps = ViewPropsOf<typeof InstanceShape>;

export function Body(self: BodyProps) {
  const { model, send } = self;
  const actions = actionsOf(self);
  const past = isPast(self);
  return (
    <>
      <Sections
        opened={model.opened}
        more={
          actions.length === 0 || past
            ? []
            : [
                {
                  key: 'actions',
                  title: 'Actions',
                  folded: foldedOf(actions, model.outcome),
                  body: (
                    <Actions
                      actions={actions}
                      sending={model.sending}
                      outcome={model.outcome}
                      onSend={(tag, message) =>
                        send({ _tag: 'Submitted', tag, message })
                      }
                      onEdit={(tag) => send({ _tag: 'Edited', tag })}
                    />
                  ),
                },
              ]
        }
      />
      {past && actions.length > 0 && (
        <PastStep onNow={() => send({ _tag: 'NowAsked' })} />
      )}
      {model.problem && (
        <p className="px-1 pb-2 text-[11px] text-muted-foreground">
          {model.problem}
        </p>
      )}
    </>
  );
}
